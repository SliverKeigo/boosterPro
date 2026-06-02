import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的角色 CRUD（自建自删）。
// 路由 src/app/api/roles/route.ts + [id]/route.ts，模型 Role（name @unique, description?）。
// 守卫 requireAdmin → 匿名 401。我们的测试角色无关联用户，故 DELETE 可成功。
describe('E2E 角色管理 全 CRUD', () => {
  let id = 0
  const name = uniq('角色')

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/roles/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/roles', { name })
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/roles')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id', async () => {
    const r = await api('POST', '/api/roles', { name, description: '初始描述' })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
    expect(r.data.description).toBe('初始描述')
  })

  it('POST 空名 → 400', async () => {
    const r = await api('POST', '/api/roles', {})
    expect(r.status).toBe(400)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/roles/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.name).toBe(name)
  })

  it('GET 不存在的详情 → 404', async () => {
    const r = await api('GET', '/api/roles/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/roles')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新名称与描述 → 200', async () => {
    const r = await api('PUT', `/api/roles/${id}`, { name: `${name}_改`, description: '改后描述' })
    expect(r.status).toBe(200)
    expect(r.data.name).toBe(`${name}_改`)
    expect(r.data.description).toBe('改后描述')
  })

  it('PUT 空名 → 400', async () => {
    const r = await api('PUT', `/api/roles/${id}`, { name: '' })
    expect(r.status).toBe(400)
  })

  it('DELETE 删除 → 200，且列表不再包含 / 详情 404', async () => {
    const r = await api('DELETE', `/api/roles/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/roles')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    const detail = await api('GET', `/api/roles/${id}`)
    expect(detail.status).toBe(404)
    id = 0
  })
})
