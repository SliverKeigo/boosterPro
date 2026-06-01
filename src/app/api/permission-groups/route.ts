/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { RESOURCE_KEYS, ACTION_KEYS } from '@/lib/resources'

// 仅管理员可管理权限：未登录或非 admin 一律 403
async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) throw new HttpError(403, '仅管理员可管理权限')
  return user
}

const MEMBER_TYPES = ['USER', 'DEPARTMENT', 'ROLE']

/**
 * 校验权限组输入并归一化：
 * - name 必须是非空字符串且长度 ≤ 200（对应 NOT NULL VarChar(200) 列）
 * - resource 必须 ∈ RESOURCE_KEYS
 * - actions 必须是数组且每项 ∈ ACTION_KEYS
 * - applyToAll 必须是布尔值（归一化为 boolean 后写入 Prisma Boolean 列）
 * - members 每项 memberType ∈ MEMBER_TYPES、memberId 经 Number() 后为有限正整数
 * - applyToAll === true 时强制使用空 members（忽略传入成员，避免冗余记录）
 * 返回归一化后的 applyToAll（boolean）与 members（memberId 已转为 number）。
 */
function validatePermissionGroupInput(
  name: unknown,
  resource: unknown,
  actions: unknown,
  applyToAll: unknown,
  members: unknown,
): { applyToAll: boolean; members: { memberType: string; memberId: number }[] } {
  if (typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, '权限组名称不能为空')
  }
  if (name.length > 200) {
    throw new HttpError(400, '权限组名称过长')
  }
  if (typeof resource !== 'string' || !RESOURCE_KEYS.includes(resource as any)) {
    throw new HttpError(400, '非法的资源标识')
  }
  if (!Array.isArray(actions) || actions.some((a) => !ACTION_KEYS.includes(a as any))) {
    throw new HttpError(400, '包含非法的功能权限')
  }
  if (typeof applyToAll !== 'boolean') {
    throw new HttpError(400, 'applyToAll 必须为布尔值')
  }
  // applyToAll 为 true 时忽略传入 members，使用空数组避免冗余成员记录
  if (applyToAll) return { applyToAll, members: [] }
  const rawMembers = Array.isArray(members) ? members : []
  const normalizedMembers = rawMembers.map((m: any) => {
    if (!m || !MEMBER_TYPES.includes(m.memberType)) {
      throw new HttpError(400, '包含非法的成员类型')
    }
    const memberId = Number(m.memberId)
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw new HttpError(400, '包含非法的成员 ID')
    }
    return { memberType: m.memberType, memberId }
  })
  return { applyToAll, members: normalizedMembers }
}

// 列表：支持 ?resource=KEY 过滤，返回 { data }（含成员）
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const resource = new URL(req.url).searchParams.get('resource')
    const data = await prisma.permissionGroup.findMany({
      where: resource ? { resource } : undefined,
      include: { members: true },
      orderBy: { id: 'desc' },
    })
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新建权限组：applyToAll=true 时 members 可为空数组
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { name, resource, actions = [], applyToAll = false, members = [] } = body
    const { applyToAll: applyAll, members: normalizedMembers } =
      validatePermissionGroupInput(name, resource, actions, applyToAll, members)
    const item = await prisma.permissionGroup.create({
      data: {
        name,
        resource,
        actions,
        applyToAll: applyAll,
        members: {
          create: normalizedMembers,
        },
      },
      include: { members: true },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
