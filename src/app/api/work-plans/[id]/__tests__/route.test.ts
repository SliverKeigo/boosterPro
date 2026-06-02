import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { workPlan: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, PUT, DELETE } from '@/app/api/work-plans/[id]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('GET /api/work-plans/[id]', () => {
  it('存在 → 200', async () => {
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 1, title: 'x' })
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 1, title: 'x' })
    expect(mock(prisma.workPlan.findUnique).mock.calls[0][0].where).toEqual({ id: 1 })
  })

  it('不存在 → 404', async () => {
    mock(prisma.workPlan.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(404)
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await GET(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.workPlan.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/work-plans/[id]', () => {
  it('合法 → 200', async () => {
    mock(prisma.workPlan.update).mockResolvedValue({ id: 1 })
    const res = await PUT(
      new Request('http://t/api/work-plans/1', {
        method: 'PUT',
        body: JSON.stringify({ title: '改名', startDate: '2026-02-02' }),
      }),
      ctx('1'),
    )
    expect(res.status).toBe(200)
    const args = mock(prisma.workPlan.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data.startDate).toBeInstanceOf(Date)
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await PUT(
      new Request('http://t/api/work-plans/1', { method: 'PUT', body: '{}' }),
      ctx('1'),
    )
    expect(res.status).toBe(403)
    expect(prisma.workPlan.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/work-plans/[id]', () => {
  it('合法 → success', async () => {
    mock(prisma.workPlan.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mock(prisma.workPlan.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await DELETE(new Request('http://t/api/work-plans/1'), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.workPlan.delete).not.toHaveBeenCalled()
  })
})
