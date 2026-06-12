import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  hasAction: vi.fn(),
}))
// 路由通过 (await import('bcryptjs')).default.hash 调用，需把 default.hash mock 成可断言的桩。
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'HASH'), compare: vi.fn(async () => true) },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser, requirePermission, hasAction } from '@/lib/permissions'
import bcrypt from 'bcryptjs'
import { GET, POST } from '@/app/api/users/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(admin)
  mock(getCurrentUser).mockResolvedValue(admin)
  mock(hasAction).mockResolvedValue(false) // 默认：普通用户无 SYS_USER 授权
})

describe('GET /api/users', () => {
  it('管理员：返回全量字段（omit passwordHash + include 部门/角色）', async () => {
    mock(getCurrentUser).mockResolvedValue(admin)
    mock(prisma.user.findMany).mockResolvedValue([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ])
    const res = await GET(new Request('http://t/api/users'))
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

  it('被授「用户管理-查看」的普通用户：也返回全量字段', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    mock(hasAction).mockResolvedValue(true)
    mock(prisma.user.findMany).mockResolvedValue([{ id: 1, name: 'A' }])
    const res = await GET(new Request('http://t/api/users'))
    expect(res.status).toBe(200)
    expect(hasAction).toHaveBeenCalledWith(normal, 'SYS_USER', 'VIEW')
    const args = mock(prisma.user.findMany).mock.calls[0][0]
    expect(args.omit).toEqual({ passwordHash: true })
  })

  it('普通用户：仅返回精简字段 { id, name, departmentId }', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    mock(prisma.user.findMany).mockResolvedValue([{ id: 5, name: 'X', departmentId: 1 }])
    const res = await GET(new Request('http://t/api/users'))
    expect(res.status).toBe(200)
    const args = mock(prisma.user.findMany).mock.calls[0][0]
    expect(args.select).toEqual({ id: true, name: true, departmentId: true })
    expect(args.omit).toBeUndefined()
  })

  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/users'))
    expect(res.status).toBe(401)
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/users', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t/api/users', { method: 'POST', body: JSON.stringify(body) })

  it('有 SYS_USER-新增 权限创建：密码被 bcrypt.hash，passwordHash 被 omit，返回 201', async () => {
    mock(prisma.user.create).mockResolvedValue({ id: 10, name: '张三', username: 'zs' })
    const res = await POST(makeReq({ name: '张三', username: 'zs', password: 'pw', departmentId: '3', roleId: '4' }))
    expect(requirePermission).toHaveBeenCalledWith('SYS_USER', 'CREATE')
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

  it('无权限 → 403（关键安全断言），且不写库/不哈希', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await POST(makeReq({ name: '张三', username: 'zs', password: 'pw' }))
    expect(res.status).toBe(403)
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(bcrypt.hash).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
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
