import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, POST } from '@/app/api/roles/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
})

describe('GET /api/roles', () => {
  it('管理员：返回 { data, total }（含 _count.users）', async () => {
    mock(prisma.role.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requireAdmin).toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
    const args = mock(prisma.role.findMany).mock.calls[0][0]
    expect(args.include).toEqual({ _count: { select: { users: true } } })
  })

  it('非管理员 → 403（GET 也是 admin-only），不查库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await GET()
    expect(res.status).toBe(403)
    expect(prisma.role.findMany).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/roles', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t/api/roles', { method: 'POST', body: JSON.stringify(body) })

  it('管理员创建：调用 prisma.role.create，返回 201', async () => {
    mock(prisma.role.create).mockResolvedValue({ id: 10, name: '顾问' })
    const res = await POST(makeReq({ name: '顾问', description: 'd' }))
    expect(requireAdmin).toHaveBeenCalled()
    const args = mock(prisma.role.create).mock.calls[0][0]
    expect(args.data).toEqual({ name: '顾问', description: 'd' })
    expect(res.status).toBe(201)
  })

  it('非管理员 → 403（关键安全断言），不写库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await POST(makeReq({ name: '顾问' }))
    expect(res.status).toBe(403)
    expect(prisma.role.create).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await POST(makeReq({ name: '顾问' }))
    expect(res.status).toBe(401)
  })

  it('缺少 name → 400，不写库', async () => {
    const res = await POST(makeReq({ description: 'd' }))
    expect(res.status).toBe(400)
    expect(prisma.role.create).not.toHaveBeenCalled()
  })
})
