import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
}))
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'HASH'), compare: vi.fn(async () => true) },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAdmin } from '@/lib/permissions'
import bcrypt from 'bcryptjs'
import { GET, PUT, DELETE } from '@/app/api/users/[id]/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
  mock(getCurrentUser).mockResolvedValue(admin)
})

describe('GET /api/users/[id]', () => {
  it('管理员：全量字段（omit passwordHash）', async () => {
    mock(getCurrentUser).mockResolvedValue(admin)
    mock(prisma.user.findUnique).mockResolvedValue({ id: 1, name: 'A' })
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(res.status).toBe(200)
    const args = mock(prisma.user.findUnique).mock.calls[0][0]
    expect(args.omit).toEqual({ passwordHash: true })
    expect(args.include).toEqual({ department: true, role: true })
  })

  it('普通用户：仅 { id, name }', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    mock(prisma.user.findUnique).mockResolvedValue({ id: 1, name: 'A' })
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(res.status).toBe(200)
    const args = mock(prisma.user.findUnique).mock.calls[0][0]
    expect(args.select).toEqual({ id: true, name: true })
  })

  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(res.status).toBe(401)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('找不到 → 404', async () => {
    mock(getCurrentUser).mockResolvedValue(admin)
    mock(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), ctx('999'))
    expect(res.status).toBe(404)
  })

  it('非法 ID → 400', async () => {
    const res = await GET(new Request('http://t'), ctx('abc'))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/users/[id]', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t', { method: 'PUT', body: JSON.stringify(body) })

  it('管理员更新：传 password 时哈希，omit passwordHash，返回 200', async () => {
    mock(prisma.user.update).mockResolvedValue({ id: 1, name: '改' })
    const res = await PUT(makeReq({ name: '改', password: 'pw', departmentId: '3' }), ctx('1'))
    expect(requireAdmin).toHaveBeenCalled()
    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 10)
    const args = mock(prisma.user.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data.passwordHash).toBe('HASH')
    expect(args.data.departmentId).toBe(3)
    expect(args.omit).toEqual({ passwordHash: true })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.not.toHaveProperty('passwordHash')
  })

  it('未传 password 时不哈希、不下发 passwordHash 字段', async () => {
    mock(prisma.user.update).mockResolvedValue({ id: 1 })
    await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(bcrypt.hash).not.toHaveBeenCalled()
    const args = mock(prisma.user.update).mock.calls[0][0]
    expect(args.data.passwordHash).toBeUndefined()
  })

  it('非管理员 → 403（关键安全断言），不写库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('非法 ID → 400', async () => {
    const res = await PUT(makeReq({ name: '改' }), ctx('0'))
    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/users/[id]', () => {
  it('管理员删除：调用 prisma.user.delete，返回 success', async () => {
    mock(prisma.user.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx('1'))
    expect(requireAdmin).toHaveBeenCalled()
    expect(mock(prisma.user.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('非管理员 → 403（关键安全断言），不删除', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('非法 ID → 400，不删除', async () => {
    const res = await DELETE(new Request('http://t', { method: 'DELETE' }), ctx('-1'))
    expect(res.status).toBe(400)
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })
})
