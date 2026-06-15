// 组相关的服务端判定：getMyGroupId / getMyLedGroupId（/api/permissions/my 暴露 groupId / ledGroupId 用）。
import { prisma } from '@/lib/prisma'
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
