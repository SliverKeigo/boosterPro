/* eslint-disable @typescript-eslint/no-explicit-any */
// 服务端权限判定。仅在 route handler / server 代码中使用（依赖 prisma 与 next/headers）。
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
  roleId: number | null
}

// 从 cookie 解析当前登录用户（含 isAdmin / department / role），未登录返回 null
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, isAdmin: true, departmentId: true, roleId: true },
  })
}

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

// 行级写守卫：在 requirePermission 通过后，进一步校验该行数据归属（编辑 / 删除非本人创建的数据将被拒绝）
export function assertRowWritable(user: CurrentUser, row: { createdById?: number | null } | null): void {
  if (!row) throw new HttpError(404, '记录不存在或已被删除')
  if (!isOwnerOrAdmin(user, row)) {
    throw new HttpError(403, '该数据由他人创建，您只能查看，无法修改或删除')
  }
}
