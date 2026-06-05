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
vi.mock('@/lib/permissions', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/groups', () => ({ assertCanWriteWorkPlan: vi.fn(), getMyGroupId: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { assertCanWriteWorkPlan, getMyGroupId } from '@/lib/groups'
import { GET, PUT, DELETE } from '@/app/api/work-plans/[id]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })
const put = (body: unknown, id = '1') =>
  PUT(new Request('http://t/api/work-plans/' + id, { method: 'PUT', body: JSON.stringify(body) }), ctx(id))

beforeEach(() => {
  vi.clearAllMocks()
  mock(assertCanWriteWorkPlan).mockResolvedValue(undefined)
})

describe('GET /api/work-plans/[id]', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(401)
  })
  it('本组成员 → 200', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 6, isAdmin: false })
    mock(getMyGroupId).mockReturnValue(20)
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 1, groupId: 20 })
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(200)
  })
  it('跨组非管理员 → 403', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 6, isAdmin: false })
    mock(getMyGroupId).mockReturnValue(20)
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 1, groupId: 99 })
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(403)
  })
  it('不存在 → 404', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.workPlan.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/work-plans/[id]', () => {
  it('组长 → 事务内 deleteMany items + update，200', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ groupId: 2 })
    mock(prisma.workPlan.update).mockResolvedValue({ id: 1 })
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07', items: [{ customerId: '3' }] })
    expect(res.status).toBe(200)
    expect(prisma.workPlanItem.deleteMany).toHaveBeenCalledWith({ where: { workPlanId: 1 } })
    expect(assertCanWriteWorkPlan).toHaveBeenCalledWith({ id: 5, isAdmin: false }, 2)
  })
  it('非组长 → 403，不改', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 9, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ groupId: 2 })
    mock(assertCanWriteWorkPlan).mockRejectedValue(new HttpError(403, 'x'))
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(403)
    expect(prisma.workPlan.update).not.toHaveBeenCalled()
  })
  it('不存在 → 404', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(prisma.workPlan.findUnique).mockResolvedValue(null)
    const res = await put({ weekStart: '2026-06-01', weekEnd: '2026-06-07' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/work-plans/[id]', () => {
  it('组长 → 删除，success', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 5, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ groupId: 2 })
    mock(prisma.workPlan.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t/api/work-plans/1', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(200)
    expect(prisma.workPlan.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
  it('非组长 → 403', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 9, isAdmin: false })
    mock(prisma.workPlan.findUnique).mockResolvedValue({ groupId: 2 })
    mock(assertCanWriteWorkPlan).mockRejectedValue(new HttpError(403, 'x'))
    const res = await DELETE(new Request('http://t/api/work-plans/1', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.workPlan.delete).not.toHaveBeenCalled()
  })
})
