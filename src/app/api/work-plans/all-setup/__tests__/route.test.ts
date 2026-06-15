import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
    requirement: { findMany: vi.fn() },
    workPlan: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({ requirePermission: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { GET } from '@/app/api/work-plans/all-setup/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe('GET /api/work-plans/all-setup', () => {
  it('无 WORK_PLAN:VIEW → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('有 VIEW → members=全员 + 各组「在招」需求（关闭/暂停被滤掉）+ 上周进展', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.user.findMany).mockResolvedValue([{ id: 1, name: '张三' }, { id: 2, name: '李四' }])
    mock(prisma.group.findMany).mockResolvedValue([{ id: 10, name: '交付一组', members: [{ id: 1 }] }])
    mock(prisma.requirement.findMany).mockResolvedValue([
      { id: 100, positionName: 'Java', customerId: 5, createdAt: new Date('2026-05-01'), status: ['新增'], customer: { shortName: 'A公司' } },
      { id: 101, positionName: '已关岗位', customerId: 5, createdAt: new Date('2026-05-02'), status: ['关闭'], customer: { shortName: 'A公司' } },
    ])
    mock(prisma.workPlan.findFirst).mockResolvedValue({
      items: [{ customerId: 5, requirementId: 100, progressNote: '上周进展' }],
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.members).toHaveLength(2)
    expect(json.groups).toHaveLength(1)
    expect(json.groups[0].groupId).toBe(10)
    expect(json.groups[0].requirements).toHaveLength(1) // 关闭岗位被滤掉
    expect(json.groups[0].requirements[0].requirementId).toBe(100)
    expect(json.groups[0].requirements[0].customerShortName).toBe('A公司')
    expect(json.lastProgress['5:100']).toBe('上周进展')
  })

  it('空集合：无组、无历史 → groups/lastProgress 空，不报错', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.user.findMany).mockResolvedValue([])
    mock(prisma.group.findMany).mockResolvedValue([])
    mock(prisma.workPlan.findFirst).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.members).toEqual([])
    expect(json.groups).toEqual([])
    expect(json.lastProgress).toEqual({})
  })

  it('组无成员 → 不查需求、requirements 为空', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.user.findMany).mockResolvedValue([{ id: 1, name: '张三' }])
    mock(prisma.group.findMany).mockResolvedValue([{ id: 10, name: '空组', members: [] }])
    mock(prisma.workPlan.findFirst).mockResolvedValue(null)
    const res = await GET()
    const json = await res.json()
    expect(json.groups[0].requirements).toEqual([])
    expect(prisma.requirement.findMany).not.toHaveBeenCalled()
  })
})
