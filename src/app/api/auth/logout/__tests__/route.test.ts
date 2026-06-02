import { describe, it, expect } from 'vitest'

import { POST } from '@/app/api/auth/logout/route'

describe('POST /api/auth/logout', () => {
  it('返回 success 并清除鉴权 cookie（空值 + maxAge 0）', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    const cookie = res.cookies.get('bp_token')
    expect(cookie).toBeDefined()
    expect(cookie?.value).toBe('')
    expect(cookie?.maxAge).toBe(0)
  })
})
