import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的字典类型 CRUD（自建自删）。
// 路由 src/app/api/dict-types/route.ts + [id]/route.ts，模型 DictType（code @unique, name, remark?）。
// 守卫 requireAdmin → 匿名 401。注意：本路由没有 GET [id]，只有 PUT/DELETE [id]。
describe('E2E 字典类型 全 CRUD', () => {
  let id = 0
  const code = uniq('dict')
  const name = uniq('字典类型')

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/dict-types/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/dict-types', { code, name })
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/dict-types')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id', async () => {
    const r = await api('POST', '/api/dict-types', { code, name, remark: '备注A' })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.code).toBe(code)
    expect(r.data.name).toBe(name)
    expect(r.data.remark).toBe('备注A')
  })

  it('POST 空 code → 400', async () => {
    const r = await api('POST', '/api/dict-types', { code: '', name })
    expect(r.status).toBe(400)
  })

  it('POST 空 name → 400', async () => {
    const r = await api('POST', '/api/dict-types', { code: uniq('dict'), name: '' })
    expect(r.status).toBe(400)
  })

  it('POST 重复 code → 409 (唯一约束)', async () => {
    const r = await api('POST', '/api/dict-types', { code, name: uniq('字典类型') })
    expect(r.status).toBe(409)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/dict-types')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 name/remark → 200', async () => {
    const r = await api('PUT', `/api/dict-types/${id}`, { code, name: `${name}_改`, remark: '备注B' })
    expect(r.status).toBe(200)
    expect(r.data.name).toBe(`${name}_改`)
    expect(r.data.remark).toBe('备注B')
  })

  it('PUT 空 name → 400', async () => {
    const r = await api('PUT', `/api/dict-types/${id}`, { code, name: '' })
    expect(r.status).toBe(400)
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/dict-types/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/dict-types')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
