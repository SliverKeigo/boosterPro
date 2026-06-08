/* eslint-disable @typescript-eslint/no-explicit-any */
// 服务端权限判定。仅在 route handler / server 代码中使用（依赖 prisma 与 next/headers）。
import { cache } from 'react'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken, AUTH_COOKIE } from '@/lib/auth'
import { HttpError } from '@/lib/apiError'
import { RESOURCE_KEYS, ACTION_KEYS, type ResourceKey, type ActionKey } from '@/lib/resources'

export interface CurrentUser {
  id: number
  name: string
  email: string | null
  isAdmin: boolean
  departmentId: number | null
  groupId: number | null
  roleId: number | null
}

// 从 cookie 解析当前登录用户（含 isAdmin / department / role），未登录返回 null。
// cache()：同一请求内多次调用只查一次库（Next App Router 请求级去重）。
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, isAdmin: true, departmentId: true, groupId: true, roleId: true },
  })
})

// 轻量登录校验：仅验 JWT cookie（不查库），用于「只需已登录、无需用户对象」的接口（文件上传/下载等热路径）。
// 读取 cookie 也会让所在 Route Handler 自动转为动态渲染（避免被 Next 静态缓存返回过时数据）。
export const getSessionPayload = cache(async () => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
})

// 计算用户对所有 resource 的功能权限集合：{ CANDIDATE: ['VIEW','CREATE',...], ... }
export async function getPermissionMap(user: CurrentUser): Promise<Record<string, string[]>> {
  // 管理员：全部资源全部动作
  if (user.isAdmin) {
    return Object.fromEntries(RESOURCE_KEYS.map((k) => [k, [...ACTION_KEYS]]))
  }
  // 收集所有作用于该用户的权限组：应用于全部用户 / 指定该用户 / 该用户所在部门 / 该用户的角色
  const or: any[] = [
    { applyToAll: true },
    { members: { some: { memberType: 'USER', memberId: user.id } } },
  ]
  if (user.departmentId != null) {
    or.push({ members: { some: { memberType: 'DEPARTMENT', memberId: user.departmentId } } })
  }
  if (user.roleId != null) {
    or.push({ members: { some: { memberType: 'ROLE', memberId: user.roleId } } })
  }
  const groups = await prisma.permissionGroup.findMany({
    where: { OR: or },
    select: { resource: true, actions: true },
  })
  const map: Record<string, Set<string>> = {}
  for (const k of RESOURCE_KEYS) map[k] = new Set()
  for (const g of groups) {
    if (!map[g.resource]) map[g.resource] = new Set()
    for (const a of g.actions) map[g.resource].add(a)
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]))
}

// 功能级判定：用户对某资源是否拥有某动作权限
export async function hasAction(user: CurrentUser, resource: ResourceKey, action: ActionKey): Promise<boolean> {
  if (user.isAdmin) return true
  const map = await getPermissionMap(user)
  return (map[resource] ?? []).includes(action)
}

// 行级 ownership：数据创建者或管理员才可写（编辑 / 删除）
export function isOwnerOrAdmin(user: CurrentUser, row: { createdById?: number | null } | null): boolean {
  if (!row) return false
  return user.isAdmin || row.createdById === user.id
}

// route 守卫：要求已登录 + 对资源有指定功能权限，否则抛 HttpError（由 handleApiError 处理）。返回当前用户。
export async function requirePermission(resource: ResourceKey, action: ActionKey): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, '未登录或登录已过期')
  if (!user.isAdmin && !(await hasAction(user, resource, action))) {
    throw new HttpError(403, '您没有执行该操作的权限')
  }
  return user
}

// 仅管理员守卫：用于用户 / 角色 / 部门 / 权限组等系统管理接口
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, '未登录或登录已过期')
  if (!user.isAdmin) throw new HttpError(403, '仅管理员可执行该操作')
  return user
}

// 行级写守卫：在 requirePermission 通过后，进一步校验该行数据归属（编辑 / 删除非本人创建的数据将被拒绝）
export function assertRowWritable(user: CurrentUser, row: { createdById?: number | null } | null): void {
  if (!row) throw new HttpError(404, '记录不存在或已被删除')
  if (!isOwnerOrAdmin(user, row)) {
    throw new HttpError(403, '该数据由他人创建，您只能查看，无法修改或删除')
  }
}

// ════════════════ 数据共享授权（data_grants）════════════════
// 模型：把「某人/某部门 录入的 某资源数据」开放给「某用户/某部门」查看(VIEW)或编辑(EDIT)。EDIT 蕴含 VIEW。
type GrantScope = { userIds: number[]; deptIds: number[] }
type ResourceGrants = { view: GrantScope; edit: GrantScope }

// 解析「授予给当前用户(或其所在部门)」的全部授权 → 每资源下我能 查看/编辑 的来源集合
//（来源 = 数据创建者 userId 或 创建者所属部门 deptId）。请求级 cache 去重（user 同引用即命中）。
export const getGrantsForUser = cache(async (user: CurrentUser): Promise<Record<string, ResourceGrants>> => {
  const or: any[] = [{ granteeType: 'USER', granteeUserId: user.id }]
  if (user.departmentId != null) or.push({ granteeType: 'DEPARTMENT', granteeDeptId: user.departmentId })
  const grants = await prisma.dataGrant.findMany({
    where: { OR: or },
    select: { resource: true, sourceType: true, sourceUserId: true, sourceDeptId: true, access: true },
  })
  const map: Record<string, ResourceGrants> = {}
  for (const g of grants) {
    const m = (map[g.resource] ??= { view: { userIds: [], deptIds: [] }, edit: { userIds: [], deptIds: [] } })
    const scopes = g.access === 'EDIT' ? [m.edit, m.view] : [m.view] // EDIT 同时给查看权
    for (const s of scopes) {
      if (g.sourceType === 'OWNER' && g.sourceUserId != null) s.userIds.push(g.sourceUserId)
      else if (g.sourceType === 'DEPARTMENT' && g.sourceDeptId != null) s.deptIds.push(g.sourceDeptId)
    }
  }
  return map
})

// 列表/读 的 Prisma where 过滤：本人创建 + 被授(view/write) + 管理员看全部。塞进 findMany({ where })。
export async function buildRowFilter(user: CurrentUser, resource: ResourceKey, mode: 'view' | 'write'): Promise<any> {
  if (user.isAdmin) return {}
  const scope = (await getGrantsForUser(user))[resource]?.[mode === 'write' ? 'edit' : 'view']
  const or: any[] = [{ createdById: user.id }]
  if (scope?.userIds.length) or.push({ createdById: { in: scope.userIds } })
  if (scope?.deptIds.length) or.push({ createdBy: { departmentId: { in: scope.deptIds } } })
  return { OR: or }
}

type RowOwner = { createdById?: number | null; createdBy?: { departmentId?: number | null } | null } | null

// 行级读/写鉴权（详情 GET / PUT / DELETE）：本人 / 管理员 / 被授(对应 mode) 放行，否则抛错。
// row 需含 createdById；按部门授权判定时需含 createdBy.departmentId（取 existing 时一并 select）。
export async function assertRowAccess(user: CurrentUser, row: RowOwner, resource: ResourceKey, mode: 'view' | 'write'): Promise<void> {
  if (!row) throw new HttpError(404, '记录不存在或已被删除')
  if (user.isAdmin || row.createdById === user.id) return
  const scope = (await getGrantsForUser(user))[resource]?.[mode === 'write' ? 'edit' : 'view']
  const okUser = row.createdById != null && !!scope?.userIds.includes(row.createdById)
  const okDept = row.createdBy?.departmentId != null && !!scope?.deptIds.includes(row.createdBy.departmentId)
  if (okUser || okDept) return
  throw new HttpError(mode === 'write' ? 403 : 404, mode === 'write' ? '该数据未授权给您编辑' : '记录不存在或您无权查看')
}
