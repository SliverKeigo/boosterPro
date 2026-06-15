import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/auth', () => ({ verifyToken: vi.fn(), AUTH_COOKIE: 'bp_token' }))

import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { GET } from '@/app/api/auth/me/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const setCookie = (token?: string) =>
  mock(cookies).mockResolvedValue({
    get: () => (token ? { value: token } : undefined),
  })

const user = {
  id: 7,
  name: '张三',
  email: 'z@t.com',
  isAdmin: false,
  department: { name: '研发部' },
  role: { name: '顾问' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/auth/me', () => {
  it('无 token → 401', async () => {
    setCookie(undefined)
    const res = await GET()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(verifyToken).not.toHaveBeenCalled()
  })

  it('token 无效（verifyToken→null）→ 401', async () => {
    setCookie('bad')
    mock(verifyToken).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('用户不存在 → 401', async () => {
    setCookie('tok')
    mock(verifyToken).mockResolvedValue({ userId: 7 })
    mock(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('已登录 → 200 返回用户', async () => {
    setCookie('tok')
    mock(verifyToken).mockResolvedValue({ userId: 7 })
    mock(prisma.user.findUnique).mockResolvedValue({ ...user, tokenVersion: 0 })
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(user)
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    )
  })

  it('单点登录：token 版本号低于库当前值(被新登录顶下来) → 401', async () => {
    setCookie('tok')
    mock(verifyToken).mockResolvedValue({ userId: 7, tokenVersion: 1 })
    mock(prisma.user.findUnique).mockResolvedValue({ ...user, tokenVersion: 2 }) // 库已 +1
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
