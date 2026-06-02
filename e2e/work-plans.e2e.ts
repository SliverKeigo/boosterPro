import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的工作计划 CRUD（自建自删）。
// 路由 src/app/api/work-plans/route.ts + [id]/route.ts，模型 WorkPlan（所有字段可空：
// title?, ownerId?(FK users), startDate?(Date), endDate?(Date), status?, notes?）。
// 守卫 requireAdmin → 匿名 401。ownerId 用 GET /api/auth/me 拿到的当前 admin 用户 id。
describe('E2E 工作计划 全 CRUD', () => {
  let id = 0
  let ownerId = 0
  const title = uniq('工作计划')

  beforeAll(async () => {
    await login()
    const me = await api('GET', '/api/auth/me')
    expect(me.status).toBe(200)
    ownerId = me.data.id
    expect(ownerId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/work-plans/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/work-plans', { title })
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/work-plans')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id', async () => {
    const r = await api('POST', '/api/work-plans', {
      title,
      ownerId,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: '进行中',
      notes: '初始备注',
    })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.title).toBe(title)
    expect(r.data.ownerId).toBe(ownerId)
    expect(r.data.status).toBe('进行中')
    // owner 关系应被 include 带出
    expect(r.data.owner?.id).toBe(ownerId)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/work-plans/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.title).toBe(title)
  })

  it('GET 不存在的详情 → 404', async () => {
    const r = await api('GET', '/api/work-plans/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/work-plans')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 title/status/notes → 200', async () => {
    const r = await api('PUT', `/api/work-plans/${id}`, {
      title: `${title}_改`,
      ownerId,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      status: '已完成',
      notes: '改后备注',
    })
    expect(r.status).toBe(200)
    expect(r.data.title).toBe(`${title}_改`)
    expect(r.data.status).toBe('已完成')
    expect(r.data.notes).toBe('改后备注')
  })

  it('DELETE 删除 → 200，且列表不再包含 / 详情 404', async () => {
    const r = await api('DELETE', `/api/work-plans/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/work-plans')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    const detail = await api('GET', `/api/work-plans/${id}`)
    expect(detail.status).toBe(404)
    id = 0
  })
})
