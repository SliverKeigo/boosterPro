import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { group: { findFirst: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { getMyLedGroupId } from '@/lib/groups'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
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
