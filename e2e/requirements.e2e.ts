import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的客户需求 CRUD（自建自删，不留垃圾）。
// Requirement 必填(非空无默认)：customerId(FK→Customer,必填) / positionName / headcount / status / deadline / baseCity。
// 先建 Customer 前置（必填 shortName / region / address / detailedAddress），结束反序删除。
describe('E2E 客户需求管理 全 CRUD', () => {
  let id = 0
  let customerId = 0
  const positionName = uniq('职位')

  const payload = () => ({
    customerId,
    positionName,
    headcount: 2,
    status: '进行中',
    deadline: '2026-12-31',
    baseCity: '上海',
    recruiter: '张三',
    monthlySalaryMin: 20000,
    monthlySalaryMax: 35000,
    // GenderType 枚举：Prisma Client 需传枚举标识符（非 @map 的中文 DB 值）
    genderRequirement: 'ANY', // 不限
    educationRequirement: '本科', // educationRequirement 是 String? 普通字段，可直接中文

    industry: '互联网',
    jobDescription: 'E2E 测试岗位描述',
  })

  beforeAll(async () => {
    await login()
    // 前置：创建 Customer
    const c = await api('POST', '/api/clients', {
      shortName: uniq('客户'),
      region: '华东',
      address: '上海市',
      detailedAddress: '上海市浦东新区张江高科技园区',
    })
    if (c.status !== 201) {
      throw new Error(`前置 Customer 创建失败 ${c.status}: ${JSON.stringify(c.data)}`)
    }
    customerId = c.data.id
  })

  afterAll(async () => {
    // 反序删除：先 Requirement 再 Customer
    if (id) await api('DELETE', `/api/requirements/${id}`)
    if (customerId) await api('DELETE', `/api/clients/${customerId}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/requirements', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/requirements')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201，带 id 与 createdById', async () => {
    const r = await api('POST', '/api/requirements', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.positionName).toBe(positionName)
    expect(r.data.customerId).toBe(customerId)
    expect(r.data.createdById).toBeGreaterThan(0)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/requirements/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/requirements/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/requirements')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200，改动被持久化', async () => {
    const r = await api('PUT', `/api/requirements/${id}`, {
      ...payload(),
      headcount: 5,
    })
    expect(r.status).toBe(200)
    expect(r.data.headcount).toBe(5)
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/requirements/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/requirements')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
