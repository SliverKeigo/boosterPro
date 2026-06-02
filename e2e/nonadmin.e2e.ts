import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, login, uniq } from './_client'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

// 安全边界：非管理员用户不得越权访问管理接口，且 GET /api/users 仅返回精简字段。
describe('E2E 非管理员越权边界', () => {
  let userId = 0
  let nonAdminCookie = ''
  const username = uniq('nonadmin')
  const password = 'Passw0rd!'
  const name = uniq('普通用户')

  beforeAll(async () => {
    await login() // admin
    // admin 创建一个非管理员用户（POST /api/users 不设 isAdmin → 默认 false）
    const created = await api('POST', '/api/users', { name, username, password })
    expect(created.status).toBe(201)
    userId = created.data.id
    expect(userId).toBeGreaterThan(0)

    // 用该非管理员账号原始登录，拿其 bp_token cookie
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    expect(res.status).toBe(200)
    nonAdminCookie = (res.headers.get('set-cookie') || '').match(/bp_token=[^;]+/)?.[0] || ''
    expect(nonAdminCookie).toBeTruthy()
  })

  afterAll(async () => {
    if (userId) await api('DELETE', `/api/users/${userId}`)
  })

  it('非管理员 POST /api/roles → 403', async () => {
    const res = await fetch(`${BASE}/api/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: nonAdminCookie },
      body: JSON.stringify({ name: uniq('角色') }),
    })
    expect(res.status).toBe(403)
  })

  it('非管理员 POST /api/users → 403', async () => {
    const res = await fetch(`${BASE}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: nonAdminCookie },
      body: JSON.stringify({ name: uniq('x'), username: uniq('x'), password }),
    })
    expect(res.status).toBe(403)
  })

  it('非管理员 GET /api/users → 200 仅精简字段，无 passwordHash / email / username', async () => {
    const res = await fetch(`${BASE}/api/users`, {
      method: 'GET',
      headers: { cookie: nonAdminCookie },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const rows: any[] = Array.isArray(body) ? body : body?.data ?? []
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    for (const u of rows) {
      // 精简形：仅 { id, name, departmentId }
      expect(u).not.toHaveProperty('passwordHash')
      expect(u).not.toHaveProperty('email')
      expect(u).not.toHaveProperty('username')
      expect(u).not.toHaveProperty('isAdmin')
      expect(u).toHaveProperty('id')
      expect(u).toHaveProperty('name')
    }
  })
})
