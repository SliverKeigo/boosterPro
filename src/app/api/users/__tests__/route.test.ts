import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
}))
// 路由通过 (await import('bcryptjs')).default.hash 调用，需把 default.hash mock 成可断言的桩。
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'HASH'), compare: vi.fn(async () => true) },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireAdmin } from '@/lib/permissions'
import bcrypt from 'bcryptjs'
import { GET, POST } from '@/app/api/users/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
  mock(getCurrentUser).mockResolvedValue(admin)
})

describe('GET /api/users', () => {
  it('管理员：返回全量字段（omit passwordHash + include 部门/角色）', async () => {
    mock(getCurrentUser).mockResolvedValue(admin)
    mock(prisma.user.findMany).mockResolvedValue([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      total: 2,
    })
    const args = mock(prisma.user.findMany).mock.calls[0][0]
    expect(args.omit).toEqual({ passwordHash: true })
    expect(args.include).toEqual({ department: true, role: true })
  })

  it('普通用户：仅返回精简字段 { id, name, departmentId }', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    mock(prisma.user.findMany).mockResolvedValue([{ id: 5, name: 'X', departmentId: 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    const args = mock(prisma.user.findMany).mock.calls[0][0]
    expect(args.select).toEqual({ id: true, name: true, departmentId: true })
    expect(args.omit).toBeUndefined()
  })

  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/users', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t/api/users', { method: 'POST', body: JSON.stringify(body) })

  it('管理员创建：密码被 bcrypt.hash，passwordHash 被 omit，返回 201', async () => {
    mock(prisma.user.create).mockResolvedValue({ id: 10, name: '张三', username: 'zs' })
    const res = await POST(makeReq({ name: '张三', username: 'zs', password: 'pw', departmentId: '3', roleId: '4' }))
    expect(requireAdmin).toHaveBeenCalled()
    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 10)
    const args = mock(prisma.user.create).mock.calls[0][0]
    expect(args.data.passwordHash).toBe('HASH')
    expect(args.data.departmentId).toBe(3)
    expect(args.data.roleId).toBe(4)
    expect(args.omit).toEqual({ passwordHash: true })
    expect(res.status).toBe(201)
    // 响应体不含 passwordHash（route 用 omit，create 桩亦未返回）
    await expect(res.json()).resolves.not.toHaveProperty('passwordHash')
  })

  it('非管理员 → 403（关键安全断言），且不写库/不哈希', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await POST(makeReq({ name: '张三', username: 'zs', password: 'pw' }))
    expect(res.status).toBe(403)
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(bcrypt.hash).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await POST(makeReq({ name: '张三', username: 'zs', password: 'pw' }))
    expect(res.status).toBe(401)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('缺少必填（name/username/password）→ 400，不哈希、不写库', async () => {
    const r1 = await POST(makeReq({ username: 'zs', password: 'pw' }))
    expect(r1.status).toBe(400)
    const r2 = await POST(makeReq({ name: '张三', password: 'pw' }))
    expect(r2.status).toBe(400)
    const r3 = await POST(makeReq({ name: '张三', username: 'zs' }))
    expect(r3.status).toBe(400)
    expect(bcrypt.hash).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})
