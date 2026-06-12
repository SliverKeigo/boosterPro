import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
}))
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'NEWHASH'), compare: vi.fn(async () => true) },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import bcrypt from 'bcryptjs'
import { POST } from '@/app/api/auth/change-password/route'

const me = { id: 7, name: '张三', email: null, isAdmin: false, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const makeReq = (body: unknown) =>
  new Request('http://t/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(getCurrentUser).mockResolvedValue(me)
  mock(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'OLDHASH' })
  mock(bcrypt.compare).mockResolvedValue(true)
})

describe('POST /api/auth/change-password', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await POST(makeReq({ oldPassword: 'a', newPassword: 'b2345678' }))
    expect(res.status).toBe(401)
  })

  it('缺字段 → 400', async () => {
    const res = await POST(makeReq({ oldPassword: '', newPassword: '' }))
    expect(res.status).toBe(400)
  })

  it('新密码不足 8 位 → 400', async () => {
    const res = await POST(makeReq({ oldPassword: 'old', newPassword: '1234567' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('8 位')
  })

  it('当前密码不正确 → 400，不更新', async () => {
    mock(bcrypt.compare).mockResolvedValue(false)
    const res = await POST(makeReq({ oldPassword: 'wrong', newPassword: '12345678' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('当前密码不正确')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('成功：校验旧密码后按 id 写入新 hash', async () => {
    const res = await POST(makeReq({ oldPassword: 'old', newPassword: '12345678' }))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(mock(bcrypt.compare).mock.calls[0]).toEqual(['old', 'OLDHASH'])
    const args = mock(prisma.user.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 7 })
    expect(args.data.passwordHash).toBe('NEWHASH')
  })
})
