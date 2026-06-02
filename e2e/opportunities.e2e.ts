import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的商机(Opportunity)CRUD。
// 必填(NOT NULL 且无 @default): name / description / region /
//   salesDecisionInfo / customerDecisionMaker / decisionMakerDescription
// status 有默认值("线索阶段")，nature 有默认值(DIRECT)，salesOwnerId 可选(此处用当前 admin)。
describe('E2E 商机管理 (opportunities) 全 CRUD', () => {
  let id = 0
  let salesOwnerId: number | null = null
  const name = uniq('商机')

  const payload = () => ({
    name,
    description: 'E2E 商机描述',
    region: '华东',
    salesDecisionInfo: 'E2E 销售决策信息',
    customerDecisionMaker: '张三',
    decisionMakerDescription: 'E2E 决策人描述',
    contactName: '李四',
    contactInfo: '13800000000',
    salesOwnerId,
  })

  beforeAll(async () => {
    await login()
    // 取当前 admin 用户 id 作为 salesOwnerId（可选 FK）
    const me = await api('GET', '/api/auth/me')
    expect(me.status).toBe(200)
    salesOwnerId = me.data.id
    expect(salesOwnerId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/opportunities/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/opportunities', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/opportunities')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201 带 id / createdById / 默认 status', async () => {
    const r = await api('POST', '/api/opportunities', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
    expect(r.data.createdById).toBeGreaterThan(0)
    // status 未传，应落默认值
    expect(r.data.status).toBe('线索阶段')
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/opportunities/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
    expect(r.data.name).toBe(name)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/opportunities/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/opportunities')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200 字段已改', async () => {
    const r = await api('PUT', `/api/opportunities/${id}`, {
      ...payload(),
      status: '商务谈判',
      description: '更新后的描述',
    })
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('商务谈判')
    expect(r.data.description).toBe('更新后的描述')
  })

  it('DELETE 删除 → 200，且详情 404 / 列表不再包含', async () => {
    const r = await api('DELETE', `/api/opportunities/${id}`)
    expect(r.status).toBe(200)
    const detail = await api('GET', `/api/opportunities/${id}`)
    expect(detail.status).toBe(404)
    const after = await api('GET', '/api/opportunities')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
