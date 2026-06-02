import { describe, it, expect, beforeAll } from 'vitest'
import { api, anon, login } from './_client'

// GET /api/permissions/my：返回当前用户权限映射。
describe('E2E 当前用户权限 /api/permissions/my', () => {
  beforeAll(async () => {
    await login()
  })

  it('未登录 → 401', async () => {
    const r = await anon('GET', '/api/permissions/my')
    expect(r.status).toBe(401)
  })

  it('管理员 → 200，isAdmin=true 且 permissions 非空', async () => {
    const r = await api('GET', '/api/permissions/my')
    expect(r.status).toBe(200)
    expect(r.data.isAdmin).toBe(true)
    expect(typeof r.data.userId).toBe('number')
    expect(r.data.userId).toBeGreaterThan(0)
    expect(r.data.permissions).toBeTruthy()
    // 管理员应对所有资源拥有全部动作
    expect(Object.keys(r.data.permissions).length).toBeGreaterThan(0)
    const cand = r.data.permissions.CANDIDATE
    expect(Array.isArray(cand)).toBe(true)
    expect(cand).toContain('VIEW')
    expect(cand).toContain('CREATE')
  })
})
