import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
// bcryptjs 在 route 内以 (await import('bcryptjs')).default 形式取用，需 mock default.compare
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ signToken: vi.fn(async () => 'tok'), AUTH_COOKIE: 'bp_token' }))

import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { POST } from '@/app/api/auth/login/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const dbUser = {
  id: 7,
  name: '张三',
  username: 'zhangsan',
  email: 'z@t.com',
  passwordHash: 'hash',
  department: { name: '研发部' },
}

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/auth/login', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/login', () => {
  it('缺少账号或密码 → 400', async () => {
    const res = await post({ username: 'zhangsan' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: '请输入账号和密码' })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('用户不存在 → 401', async () => {
    mock(prisma.user.findUnique).mockResolvedValue(null)
    const res = await post({ username: 'nope', password: 'x' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: '账号或密码错误' })
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })

  it('密码不匹配 → 401', async () => {
    mock(prisma.user.findUnique).mockResolvedValue(dbUser)
    mock(bcrypt.compare).mockResolvedValue(false)
    const res = await post({ username: 'zhangsan', password: 'wrong' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: '账号或密码错误' })
  })

  it('校验通过 → 200 + success + 设置鉴权 cookie', async () => {
    mock(prisma.user.findUnique).mockResolvedValue(dbUser)
    mock(bcrypt.compare).mockResolvedValue(true)
    const res = await post({ username: 'zhangsan', password: 'right' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.user).toMatchObject({ id: 7, username: 'zhangsan', department: '研发部' })
    expect(bcrypt.compare).toHaveBeenCalledWith('right', 'hash')
    const cookie = res.cookies.get('bp_token')
    expect(cookie).toBeDefined()
    expect(cookie?.value).toBe('tok')
  })

  it('remember:true → 持久 cookie（maxAge ~7 天）', async () => {
    mock(prisma.user.findUnique).mockResolvedValue(dbUser)
    mock(bcrypt.compare).mockResolvedValue(true)
    const res = await post({ username: 'zhangsan', password: 'right', remember: true })
    const cookie = res.cookies.get('bp_token')
    expect(cookie?.maxAge).toBe(7 * 24 * 60 * 60)
  })

  it('remember:false → 会话 cookie（不设 maxAge）', async () => {
    mock(prisma.user.findUnique).mockResolvedValue(dbUser)
    mock(bcrypt.compare).mockResolvedValue(true)
    const res = await post({ username: 'zhangsan', password: 'right', remember: false })
    const cookie = res.cookies.get('bp_token')
    expect(cookie?.maxAge).toBeUndefined()
  })

  it('请求体非法 JSON → 500（catch 兜底）', async () => {
    const res = await post('not-json')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: '服务器错误' })
  })
})
