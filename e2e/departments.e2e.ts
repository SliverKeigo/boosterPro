import { describe, it, expect, beforeAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的部门 CRUD（自建自删，不留垃圾）。
describe('E2E 部门管理 全 CRUD', () => {
  let id = 0
  const name = uniq('部门')

  beforeAll(async () => {
    await login()
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/departments', { name })
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/departments')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id', async () => {
    const r = await api('POST', '/api/departments', { name })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
  })

  it('POST 空名 → 400', async () => {
    const r = await api('POST', '/api/departments', {})
    expect(r.status).toBe(400)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/departments/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/departments')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新名称 → 200', async () => {
    const r = await api('PUT', `/api/departments/${id}`, { name: `${name}_改` })
    expect(r.status).toBe(200)
    expect(r.data.name).toBe(`${name}_改`)
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/departments/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/departments')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
