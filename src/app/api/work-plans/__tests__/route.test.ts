import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { workPlan: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requirePermission: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { GET, POST } from '@/app/api/work-plans/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const post = (body: unknown) =>
  POST(new Request('http://t/api/work-plans', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/work-plans', () => {
  it('无 WORK_PLAN:VIEW → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await GET()
    expect(res.status).toBe(403)
  })
  it('有 VIEW → 看全部（findMany 不带 where 过滤）', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: false })
    mock(prisma.workPlan.findMany).mockResolvedValue([{ id: 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mock(prisma.workPlan.findMany).mock.calls[0][0].where).toBeUndefined()
  })
})

describe('POST /api/work-plans', () => {
  it('无 WORK_PLAN:CREATE → 403，不创建', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await post({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(403)
    expect(prisma.workPlan.create).not.toHaveBeenCalled()
  })
  it('缺 weekStart/weekEnd → 400', async () => {
    mock(requirePermission).mockResolvedValue({ id: 5, isAdmin: false })
    const res = await post({})
    expect(res.status).toBe(400)
  })
  it('该周已存在 → 409，不创建（一周一条）', async () => {
    mock(requirePermission).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 99 }) // 该周已存在
    const res = await post({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(409)
    expect(prisma.workPlan.create).not.toHaveBeenCalled()
  })
  it('有 CREATE → 嵌套写 items(带 groupId)+createdById，201；planDates 存 JSON 数组、空数组不入库', async () => {
    mock(requirePermission).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue(null) // 该周不存在
    mock(prisma.workPlan.create).mockResolvedValue({ id: 10 })
    const res = await post({
      weekStart: '2026-06-01', weekEnd: '2026-06-07', deliveryStrategy: '第一梯队',
      items: [{ groupId: 2, customerId: '3', requirementId: '4', participation: '2',
        assignments: [{ memberId: 6, planDates: ['2026-06-03', '2026-06-01'] }, { memberId: 7, planDates: [] }] }],
    })
    expect(res.status).toBe(201)
    const data = mock(prisma.workPlan.create).mock.calls[0][0].data
    expect(data.createdById).toBe(5)
    expect(data.groupId).toBeUndefined() // 周计划顶层不再绑组
    expect(data.items.create).toHaveLength(1)
    expect(data.items.create[0].groupId).toBe(2) // 明细带来源组
    expect(data.items.create[0].customerId).toBe(3)
    expect(data.items.create[0].assignments.create).toEqual([{ memberId: 6, planDates: '["2026-06-01","2026-06-03"]' }])
  })
})
