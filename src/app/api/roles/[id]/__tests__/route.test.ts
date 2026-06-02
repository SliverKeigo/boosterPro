import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { count: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, PUT, DELETE } from '@/app/api/roles/[id]/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
})

describe('GET /api/roles/[id]', () => {
  it('管理员：返回角色', async () => {
    mock(prisma.role.findUnique).mockResolvedValue({ id: 1, name: '顾问' })
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(requireAdmin).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(mock(prisma.role.findUnique).mock.calls[0][0].where).toEqual({ id: 1 })
  })

  it('非管理员 → 403，不查库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.role.findUnique).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('找不到 → 404', async () => {
    mock(prisma.role.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), ctx('999'))
    expect(res.status).toBe(404)
  })

  it('非法 ID → 400', async () => {
    const res = await GET(new Request('http://t'), ctx('abc'))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/roles/[id]', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t', { method: 'PUT', body: JSON.stringify(body) })

  it('管理员更新：调用 prisma.role.update，返回 200', async () => {
    mock(prisma.role.update).mockResolvedValue({ id: 1, name: '改' })
    const res = await PUT(makeReq({ name: '改', description: 'd' }), ctx('1'))
    expect(requireAdmin).toHaveBeenCalled()
    const args = mock(prisma.role.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data).toEqual({ name: '改', description: 'd' })
    expect(res.status).toBe(200)
  })

  it('非管理员 → 403（关键安全断言），不写库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.role.update).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('缺少 name → 400，不写库', async () => {
    const res = await PUT(makeReq({ description: 'd' }), ctx('1'))
    expect(res.status).toBe(400)
    expect(prisma.role.update).not.toHaveBeenCalled()
  })

  it('非法 ID → 400', async () => {
    const res = await PUT(makeReq({ name: '改' }), ctx('0'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/roles/[id]', () => {
  const makeReq = () => new Request('http://t', { method: 'DELETE' })

  it('管理员删除（无关联用户）：调用 prisma.role.delete，返回 success', async () => {
    mock(prisma.user.count).mockResolvedValue(0)
    mock(prisma.role.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(makeReq(), ctx('1'))
    expect(requireAdmin).toHaveBeenCalled()
    expect(mock(prisma.user.count).mock.calls[0][0]).toEqual({ where: { roleId: 1 } })
    expect(mock(prisma.role.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('角色下仍有用户 → 400，不删除', async () => {
    mock(prisma.user.count).mockResolvedValue(3)
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(400)
    expect(prisma.role.delete).not.toHaveBeenCalled()
  })

  it('非管理员 → 403（关键安全断言），不删除', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(prisma.role.delete).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('非法 ID → 400', async () => {
    const res = await DELETE(makeReq(), ctx('-1'))
    expect(res.status).toBe(400)
    expect(prisma.role.delete).not.toHaveBeenCalled()
  })
})
