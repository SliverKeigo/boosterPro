import { describe, it, expect } from 'vitest'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'
const ADMIN_USER = 'admin'
const ADMIN_PASS = 'Admin@123456'

// 原始 fetch 鉴权流程（登录 / me / logout），不复用 _client 的 memo cookie。
describe('E2E 鉴权 login/me/logout', () => {
  it('POST /api/auth/login 密码错误 → 401', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: 'definitely-wrong' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/login 缺字段 → 400', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/auth/login 管理员凭据 → 200 + Set-Cookie bp_token', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.user?.username).toBe(ADMIN_USER)
    expect(body.user).not.toHaveProperty('passwordHash')
    const sc = res.headers.get('set-cookie') || ''
    expect(sc).toMatch(/bp_token=/)
  })

  it('GET /api/auth/me 已登录 → 200 返回当前用户', async () => {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    })
    const cookie = (loginRes.headers.get('set-cookie') || '').match(/bp_token=[^;]+/)?.[0] || ''
    expect(cookie).toBeTruthy()

    const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.username === ADMIN_USER || me.name).toBeTruthy()
    expect(me.isAdmin).toBe(true)
    expect(me).not.toHaveProperty('passwordHash')
  })

  it('GET /api/auth/me 未登录 → 401', async () => {
    const res = await fetch(`${BASE}/api/auth/me`)
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/logout 已登录 → 200 且清除 bp_token cookie', async () => {
    // logout 路由本身无鉴权，但 middleware 要求登录态：必须带有效 cookie 调用
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    })
    const cookie = (loginRes.headers.get('set-cookie') || '').match(/bp_token=[^;]+/)?.[0] || ''
    expect(cookie).toBeTruthy()

    const res = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    const sc = res.headers.get('set-cookie') || ''
    // 清除 cookie：设置空值并立即过期（Max-Age=0 或 Expires 过去时间）
    expect(sc).toMatch(/bp_token=/)
    expect(/bp_token=;|bp_token="";|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc)).toBe(true)
  })

  // logout 已加入 middleware 公开路径，未登录/已过期也能幂等调用（清 cookie）→ 200。
  it('POST /api/auth/logout 未登录也可幂等调用 → 200', async () => {
    const res = await fetch(`${BASE}/api/auth/logout`, { method: 'POST' })
    expect(res.status).toBe(200)
  })
})
