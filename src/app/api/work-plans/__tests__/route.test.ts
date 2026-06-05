import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { workPlan: { findMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/groups', () => ({ assertCanWriteWorkPlan: vi.fn(), getMyGroupId: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { assertCanWriteWorkPlan, getMyGroupId } from '@/lib/groups'
import { GET, POST } from '@/app/api/work-plans/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const post = (body: unknown) =>
  POST(new Request('http://t/api/work-plans', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  mock(assertCanWriteWorkPlan).mockResolvedValue(undefined)
})

describe('GET /api/work-plans', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })
  it('管理员 → where 空（看全部）', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.workPlan.findMany).mockResolvedValue([{ id: 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mock(prisma.workPlan.findMany).mock.calls[0][0].where).toEqual({})
  })
  it('组员 → where 限本组', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 6, isAdmin: false })
    mock(getMyGroupId).mockReturnValue(20)
    mock(prisma.workPlan.findMany).mockResolvedValue([])
    await GET()
    expect(mock(prisma.workPlan.findMany).mock.calls[0][0].where).toEqual({ groupId: 20 })
  })
})

describe('POST /api/work-plans', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await post({ groupId: 1 })
    expect(res.status).toBe(401)
  })
  it('缺 groupId → 400', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 5, isAdmin: false })
    const res = await post({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(400)
  })
  it('非组长（assertCanWriteWorkPlan 抛 403）→ 403，不创建', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 5, isAdmin: false })
    mock(assertCanWriteWorkPlan).mockRejectedValue(new HttpError(403, '只有该组组长可以维护本组工作计划'))
    const res = await post({ groupId: 2, weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(403)
    expect(prisma.workPlan.create).not.toHaveBeenCalled()
  })
  it('组长 → 嵌套写 items + createdById，201；空格不入库', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.create).mockResolvedValue({ id: 10 })
    const res = await post({
      groupId: 2, weekStart: '2026-06-01', weekEnd: '2026-06-07', deliveryStrategy: '第一梯队',
      items: [{ customerId: '3', requirementId: '4', participation: '2',
        assignments: [{ memberId: 6, planDates: '6.1、6.3' }, { memberId: 7, planDates: '' }] }],
    })
    expect(res.status).toBe(201)
    expect(assertCanWriteWorkPlan).toHaveBeenCalledWith({ id: 5, isAdmin: false }, 2)
    const data = mock(prisma.workPlan.create).mock.calls[0][0].data
    expect(data.createdById).toBe(5)
    expect(data.groupId).toBe(2)
    expect(data.items.create).toHaveLength(1)
    expect(data.items.create[0].assignments.create).toEqual([{ memberId: 6, planDates: '6.1、6.3' }])
    expect(data.items.create[0].customerId).toBe(3)
  })
})
