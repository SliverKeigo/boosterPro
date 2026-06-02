import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的字典项 CRUD（自建自删）。
// 路由 src/app/api/dict-items/route.ts + [id]/route.ts，模型 DictItem
//   （typeId FK→DictType, label, value, sort@default(0), enabled@default(true)）。
// 守卫 requireAdmin → 匿名 401。
// 注意：本路由没有 GET [id]（只有 GET 列表 ?typeId=、POST、PUT[id]、DELETE[id]），
//       因此用 typeId 过滤列表来核对存在性，不做单项 GET 详情/404。
// 前置：先建一个 dict-type 作为父类型，afterAll 反序删除（先删项再删类型，类型删除会级联）。
describe('E2E 字典项 全 CRUD', () => {
  let typeId = 0
  let id = 0
  const label = uniq('字典项')
  const value = uniq('val')

  beforeAll(async () => {
    await login()
    const t = await api('POST', '/api/dict-types', { code: uniq('ditype'), name: uniq('父字典类型') })
    expect(t.status).toBe(201)
    typeId = t.data.id
    expect(typeId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    // 反序清理：先删字典项，再删父字典类型（类型删除对项已配置级联，双保险）
    if (id) await api('DELETE', `/api/dict-items/${id}`)
    if (typeId) await api('DELETE', `/api/dict-types/${typeId}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/dict-items', { typeId, label, value })
    expect(r.status).toBe(401)
  })

  it('GET 缺少 typeId → 400', async () => {
    const r = await api('GET', '/api/dict-items')
    expect(r.status).toBe(400)
  })

  it('GET 列表(?typeId=) → 200 数组', async () => {
    const r = await api('GET', `/api/dict-items?typeId=${typeId}`)
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id', async () => {
    const r = await api('POST', '/api/dict-items', { typeId, label, value, sort: 5, enabled: true })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.typeId).toBe(typeId)
    expect(r.data.label).toBe(label)
    expect(r.data.value).toBe(value)
    expect(r.data.sort).toBe(5)
    expect(r.data.enabled).toBe(true)
  })

  it('POST 空 label → 400', async () => {
    const r = await api('POST', '/api/dict-items', { typeId, label: '', value: uniq('val') })
    expect(r.status).toBe(400)
  })

  it('POST 空 value → 400', async () => {
    const r = await api('POST', '/api/dict-items', { typeId, label: uniq('字典项'), value: '' })
    expect(r.status).toBe(400)
  })

  it('POST 不存在的 typeId → 404', async () => {
    const r = await api('POST', '/api/dict-items', { typeId: 99999999, label: uniq('字典项'), value: uniq('val') })
    expect(r.status).toBe(404)
  })

  it('新建项出现在该类型的列表', async () => {
    const r = await api('GET', `/api/dict-items?typeId=${typeId}`)
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 label/value/sort/enabled → 200', async () => {
    const r = await api('PUT', `/api/dict-items/${id}`, {
      label: `${label}_改`,
      value: `${value}_改`,
      sort: 9,
      enabled: false,
    })
    expect(r.status).toBe(200)
    expect(r.data.label).toBe(`${label}_改`)
    expect(r.data.value).toBe(`${value}_改`)
    expect(r.data.sort).toBe(9)
    expect(r.data.enabled).toBe(false)
  })

  it('PUT 空 label → 400', async () => {
    const r = await api('PUT', `/api/dict-items/${id}`, { label: '', value })
    expect(r.status).toBe(400)
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/dict-items/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', `/api/dict-items?typeId=${typeId}`)
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
