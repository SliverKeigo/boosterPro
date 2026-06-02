import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的合同(Contract)CRUD。Contract 需要一个 customer 外键。
// 必填(NOT NULL 且无 @default): customerId / contractName / signingYear /
//   effectiveStart / effectiveEnd / expiryDate / serviceType / contractFileUrl
describe('E2E 合同管理 (contracts) 全 CRUD', () => {
  let customerId = 0
  let id = 0
  const contractName = uniq('合同')

  const payload = () => ({
    customerId,
    contractName,
    signingYear: 2026,
    effectiveStart: '2026-01-01',
    effectiveEnd: '2026-12-31',
    expiryDate: '2027-01-31',
    serviceType: '猎头服务',
    contractFileUrl: 'https://example.com/contract.pdf',
    headhunterFeeRate: 20,
    billingMonths: 3,
    notes: 'E2E 测试合同',
  })

  beforeAll(async () => {
    await login()
    // 创建外键前置：一个客户
    const c = await api('POST', '/api/clients', {
      shortName: uniq('合同客户'),
      region: '华东',
      address: '上海市',
      detailedAddress: '某详细地址',
    })
    expect(c.status).toBe(201)
    customerId = c.data.id
    expect(customerId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    // 逆序清理：先合同后客户
    if (id) await api('DELETE', `/api/contracts/${id}`)
    if (customerId) await api('DELETE', `/api/clients/${customerId}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/contracts', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/contracts')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id 与 createdById', async () => {
    const r = await api('POST', '/api/contracts', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.contractName).toBe(contractName)
    expect(r.data.customerId).toBe(customerId)
    expect(r.data.createdById).toBeGreaterThan(0)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/contracts/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.contractName).toBe(contractName)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/contracts/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/contracts')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200 字段已改', async () => {
    const r = await api('PUT', `/api/contracts/${id}`, {
      ...payload(),
      serviceType: 'RPO服务',
      notes: '更新后的备注',
    })
    expect(r.status).toBe(200)
    expect(r.data.serviceType).toBe('RPO服务')
    expect(r.data.notes).toBe('更新后的备注')
  })

  it('DELETE 删除 → 200，且详情 404 / 列表不再包含', async () => {
    const r = await api('DELETE', `/api/contracts/${id}`)
    expect(r.status).toBe(200)
    const detail = await api('GET', `/api/contracts/${id}`)
    expect(detail.status).toBe(404)
    const after = await api('GET', '/api/contracts')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
