import { describe, it, expect } from 'vitest'
import { HttpError, handleApiError } from '@/lib/apiError'

describe('HttpError', () => {
  it('携带 status 与 message', () => {
    const e = new HttpError(403, '无权限')
    expect(e.status).toBe(403)
    expect(e.message).toBe('无权限')
    expect(e.name).toBe('HttpError')
    expect(e).toBeInstanceOf(Error)
  })
})

describe('handleApiError', () => {
  it('HttpError → 原状态码 + 消息', async () => {
    const res = handleApiError(new HttpError(401, '未登录'))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: '未登录' })
  })

  it('Prisma P2002 唯一冲突 → 409 带 code', async () => {
    const res = handleApiError({ code: 'P2002' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('P2002')
    expect(typeof body.error).toBe('string')
  })

  it('Prisma P2025 记录不存在 → 404', async () => {
    const res = handleApiError({ code: 'P2025' })
    expect(res.status).toBe(404)
  })

  it('未知错误 → 500（测试环境返回真实 message）', async () => {
    const res = handleApiError(new Error('boom'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'boom' })
  })
})
