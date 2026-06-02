import { describe, it, expect, beforeAll } from 'vitest'
import { api, anon, login } from './_client'

// GET /api/reports：聚合候选人 / 需求（仅非敏感字段）。需 REPORT VIEW；admin 有全权限。
describe('E2E 报表 /api/reports', () => {
  beforeAll(async () => {
    await login()
  })

  it('未登录 → 401', async () => {
    const r = await anon('GET', '/api/reports')
    expect(r.status).toBe(401)
  })

  it('管理员 → 200，返回 { candidates, requirements } 数组', async () => {
    const r = await api('GET', '/api/reports')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data.candidates)).toBe(true)
    expect(Array.isArray(r.data.requirements)).toBe(true)
  })

  it('报表数据不泄露候选人 PII（phone/email/salaryPlan 等）', async () => {
    const r = await api('GET', '/api/reports')
    expect(r.status).toBe(200)
    for (const c of r.data.candidates as any[]) {
      expect(c).not.toHaveProperty('phone')
      expect(c).not.toHaveProperty('email')
      expect(c).not.toHaveProperty('birthYear')
      expect(c).not.toHaveProperty('salaryPlan')
      expect(c).not.toHaveProperty('offerFileUrl')
      expect(c).not.toHaveProperty('backgroundCheckReportUrl')
    }
  })
})
