import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的候选人 CRUD（自建自删，不留垃圾）。
// Candidate 必填(非空无默认)：name / recruitmentChannel。customerId / requirementId 均为可选 → 省略。
describe('E2E 候选人管理 全 CRUD', () => {
  let id = 0
  const name = uniq('候选人')

  const payload = () => ({
    name,
    recruitmentChannel: 'BOSS直聘',
    phone: '13900000000',
    email: 'cand_e2e@example.com',
    // 枚举字段：Prisma Client 需传枚举标识符（非 @map 的中文 DB 值）
    education: 'BACHELOR', // 本科
    schoolTier: 'T985_211', // 985/211
    recommendationStatus: 'PENDING', // 已推荐待反馈
    tags: ['E2E', '前端'],
    notes: 'E2E 测试候选人',
  })

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/candidates/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/candidates', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/candidates')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201，带 id 与 createdById', async () => {
    const r = await api('POST', '/api/candidates', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
    expect(r.data.recruitmentChannel).toBe('BOSS直聘')
    expect(r.data.createdById).toBeGreaterThan(0)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/candidates/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/candidates/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/candidates')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200，改动被持久化', async () => {
    const r = await api('PUT', `/api/candidates/${id}`, {
      ...payload(),
      recruitmentChannel: '猎聘',
    })
    expect(r.status).toBe(200)
    expect(r.data.recruitmentChannel).toBe('猎聘')
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/candidates/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/candidates')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
