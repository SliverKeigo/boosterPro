import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的客户补充(ClientSupplement)CRUD。需要一个 customer 外键。
// 必填(NOT NULL 且无 @default): customerId。其余字段均可选。
describe('E2E 客户补充 (supplements) 全 CRUD', () => {
  let customerId = 0
  let id = 0
  const demandCustomer = uniq('补充')

  const payload = () => ({
    customerId,
    demandCustomer,
    openingSpeech: 'E2E 开场白',
    companyCultureWelfare: 'E2E 企业文化与福利',
    notes: 'E2E 备注',
  })

  beforeAll(async () => {
    await login()
    const c = await api('POST', '/api/clients', {
      shortName: uniq('补充客户'),
      region: '华北',
      address: '北京市',
      detailedAddress: '某详细地址',
    })
    expect(c.status).toBe(201)
    customerId = c.data.id
    expect(customerId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    // 逆序清理：先补充后客户（补充对客户为 onDelete: Cascade，但仍显式逆序删除）
    if (id) await api('DELETE', `/api/supplements/${id}`)
    if (customerId) await api('DELETE', `/api/clients/${customerId}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/supplements', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/supplements')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id 与 createdById', async () => {
    const r = await api('POST', '/api/supplements', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.customerId).toBe(customerId)
    expect(r.data.demandCustomer).toBe(demandCustomer)
    expect(r.data.createdById).toBeGreaterThan(0)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/supplements/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.customerId).toBe(customerId)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/supplements/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/supplements')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200 字段已改', async () => {
    const r = await api('PUT', `/api/supplements/${id}`, {
      ...payload(),
      notes: '更新后的备注',
      openingSpeech: '更新后的开场白',
    })
    expect(r.status).toBe(200)
    expect(r.data.notes).toBe('更新后的备注')
    expect(r.data.openingSpeech).toBe('更新后的开场白')
  })

  it('DELETE 删除 → 200，且详情 404 / 列表不再包含', async () => {
    const r = await api('DELETE', `/api/supplements/${id}`)
    expect(r.status).toBe(200)
    const detail = await api('GET', `/api/supplements/${id}`)
    expect(detail.status).toBe(404)
    const after = await api('GET', '/api/supplements')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
