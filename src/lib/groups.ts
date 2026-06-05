// 组相关的服务端判定：支撑工作计划「组长写本组、组员读本组、管理员看全部」。
import { prisma } from '@/lib/prisma'
import { HttpError } from '@/lib/apiError'
import type { CurrentUser } from '@/lib/permissions'

/** 当前用户所属组 id（成员归属，A1：一人一组）。 */
export function getMyGroupId(user: CurrentUser): number | null {
  return user.groupId ?? null
}

/** 当前用户作为「组长」所领的组 id；非组长返回 null。 */
export async function getMyLedGroupId(user: CurrentUser): Promise<number | null> {
  const g = await prisma.group.findFirst({ where: { leaderId: user.id }, select: { id: true } })
  return g?.id ?? null
}

/** 写工作计划守卫：管理员，或「该 groupId 的组长」，否则 403。 */
export async function assertCanWriteWorkPlan(user: CurrentUser, groupId: number | null | undefined): Promise<void> {
  if (user.isAdmin) return
  if (!groupId) throw new HttpError(400, '缺少所属组')
  const g = await prisma.group.findUnique({ where: { id: Number(groupId) }, select: { leaderId: true } })
  if (!g || g.leaderId !== user.id) {
    throw new HttpError(403, '只有该组组长可以维护本组工作计划')
  }
}
