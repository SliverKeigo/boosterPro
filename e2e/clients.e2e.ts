import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的客户(Customer)CRUD（自建自删，不留垃圾）。
// Customer 必填(NOT NULL 且无 @default): shortName / region / address / detailedAddress
describe('E2E 客户管理 (clients) 全 CRUD', () => {
  let id = 0
  const shortName = uniq('客户')

  const payload = () => ({
    fullName: `${shortName}_全称`,
    shortName,
    region: '华东',
    address: '上海市浦东新区',
    detailedAddress: '张江高科技园区某号楼',
    industry: '互联网',
  })

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/clients/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/clients', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/clients')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id 与 createdById', async () => {
    const r = await api('POST', '/api/clients', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.shortName).toBe(shortName)
    expect(r.data.createdById).toBeGreaterThan(0)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/clients/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.shortName).toBe(shortName)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/clients/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/clients')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200 字段已改', async () => {
    const r = await api('PUT', `/api/clients/${id}`, {
      ...payload(),
      region: '华南',
      detailedAddress: '更新后的详细地址',
    })
    expect(r.status).toBe(200)
    expect(r.data.region).toBe('华南')
    expect(r.data.detailedAddress).toBe('更新后的详细地址')
  })

  it('DELETE 删除 → 200，且详情 404 / 列表不再包含', async () => {
    const r = await api('DELETE', `/api/clients/${id}`)
    expect(r.status).toBe(200)
    const detail = await api('GET', `/api/clients/${id}`)
    expect(detail.status).toBe(404)
    const after = await api('GET', '/api/clients')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
