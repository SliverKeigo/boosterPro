import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { group: { findFirst: vi.fn(), findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { getMyLedGroupId, assertCanWriteWorkPlan } from '@/lib/groups'
import { HttpError } from '@/lib/apiError'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const admin = { id: 1, isAdmin: true } as any
const leader = { id: 5, isAdmin: false } as any
const member = { id: 6, isAdmin: false } as any

beforeEach(() => vi.clearAllMocks())

describe('getMyLedGroupId', () => {
  it('组长 → 返回所领组 id', async () => {
    mock(prisma.group.findFirst).mockResolvedValue({ id: 20 })
    expect(await getMyLedGroupId(leader)).toBe(20)
  })
  it('非组长 → null', async () => {
    mock(prisma.group.findFirst).mockResolvedValue(null)
    expect(await getMyLedGroupId(member)).toBeNull()
  })
})

describe('assertCanWriteWorkPlan', () => {
  it('管理员 → 直接放行（不查库）', async () => {
    await expect(assertCanWriteWorkPlan(admin, 20)).resolves.toBeUndefined()
    expect(prisma.group.findUnique).not.toHaveBeenCalled()
  })
  it('该组组长 → 放行', async () => {
    mock(prisma.group.findUnique).mockResolvedValue({ leaderId: 5 })
    await expect(assertCanWriteWorkPlan(leader, 20)).resolves.toBeUndefined()
  })
  it('非该组组长 → 403', async () => {
    mock(prisma.group.findUnique).mockResolvedValue({ leaderId: 5 })
    await expect(assertCanWriteWorkPlan(member, 20)).rejects.toMatchObject({ status: 403 })
  })
  it('缺 groupId（非管理员）→ 400', async () => {
    await expect(assertCanWriteWorkPlan(member, null)).rejects.toBeInstanceOf(HttpError)
  })
})
