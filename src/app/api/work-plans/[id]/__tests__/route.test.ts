import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    workPlan: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workPlanItem: { deleteMany: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({ requirePermission: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { GET, PUT, DELETE } from '@/app/api/work-plans/[id]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })
const put = (body: unknown, id = '1') =>
  PUT(new Request('http://t/api/work-plans/' + id, { method: 'PUT', body: JSON.stringify(body) }), ctx(id))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/work-plans/[id]', () => {
  it('无 VIEW → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(403)
  })
  it('有 VIEW → 200（看全部、不限组）', async () => {
    mock(requirePermission).mockResolvedValue({ id: 6, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 1 })
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(200)
  })
  it('不存在 → 404', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.workPlan.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/work-plans/[id]', () => {
  it('有 EDIT（非创建者也可改整条）→ 事务内 deleteMany items + update，200；items 带 groupId', async () => {
    mock(requirePermission).mockResolvedValue({ id: 9, isAdmin: false })
    mock(prisma.workPlan.findUnique)
      .mockResolvedValueOnce({ id: 1 }) // existing
      .mockResolvedValueOnce(null) // 该周无其他计划
    mock(prisma.workPlan.update).mockResolvedValue({ id: 1 })
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07', items: [{ groupId: 2, customerId: '3' }] })
    expect(res.status).toBe(200)
    expect(prisma.workPlanItem.deleteMany).toHaveBeenCalledWith({ where: { workPlanId: 1 } })
    const data = mock(prisma.workPlan.update).mock.calls[0][0].data
    expect(data.items.create[0].groupId).toBe(2)
  })
  it('无 EDIT → 403，不改', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(403)
    expect(prisma.workPlan.update).not.toHaveBeenCalled()
  })
  it('改到已被别的计划占用的周 → 409，不改', async () => {
    mock(requirePermission).mockResolvedValue({ id: 5, isAdmin: true })
    mock(prisma.workPlan.findUnique)
      .mockResolvedValueOnce({ id: 1 }) // existing
      .mockResolvedValueOnce({ id: 2 }) // 该周被另一条(id=2)占用
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(409)
    expect(prisma.workPlan.update).not.toHaveBeenCalled()
  })
  it('不存在 → 404', async () => {
    mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.workPlan.findUnique).mockResolvedValueOnce(null) // existing 不存在
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/work-plans/[id]', () => {
  it('有 DELETE → 删除，success', async () => {
    mock(requirePermission).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 1 })
    mock(prisma.workPlan.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t/api/work-plans/1', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(200)
    expect(prisma.workPlan.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
  it('无 DELETE → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await DELETE(new Request('http://t/api/work-plans/1', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.workPlan.delete).not.toHaveBeenCalled()
  })
})
