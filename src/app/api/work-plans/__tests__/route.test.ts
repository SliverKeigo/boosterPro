import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { workPlan: { findMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, POST } from '@/app/api/work-plans/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/work-plans', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('GET /api/work-plans', () => {
  it('管理员 → {data,total}', async () => {
    mock(prisma.workPlan.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requireAdmin).toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await GET()
    expect(res.status).toBe(403)
    expect(prisma.workPlan.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/work-plans', () => {
  it('合法 → 201，规范化日期/ownerId', async () => {
    mock(prisma.workPlan.create).mockResolvedValue({ id: 10 })
    const res = await post({
      title: '招聘计划',
      startDate: '2026-01-01',
      endDate: '',
      ownerId: '5',
      owner: { id: 5 },
      id: 999,
    })
    expect(res.status).toBe(201)
    const data = mock(prisma.workPlan.create).mock.calls[0][0].data
    // owner / id 被剔除，不会透传
    expect(data.owner).toBeUndefined()
    expect(data.id).toBeUndefined()
    expect(data.startDate).toBeInstanceOf(Date)
    expect(data.endDate).toBeNull()
    expect(data.ownerId).toBe(5)
  })

  it('ownerId 空串 → null', async () => {
    mock(prisma.workPlan.create).mockResolvedValue({ id: 11 })
    await post({ title: 'x', ownerId: '' })
    const data = mock(prisma.workPlan.create).mock.calls[0][0].data
    expect(data.ownerId).toBeNull()
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await post({ title: 'x' })
    expect(res.status).toBe(403)
    expect(prisma.workPlan.create).not.toHaveBeenCalled()
  })
})
