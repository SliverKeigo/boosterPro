import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的公司知识库 CRUD（自建自删，不留垃圾）。
// KnowledgeBase 必填(非空无默认)：category / keywords（注意 schema/builder 用复数 keywords）。
// tags 为 String[]；builder 接受逗号字符串（非数组时整体包成单元素数组，不切分）。
describe('E2E 公司知识库 全 CRUD', () => {
  let id = 0
  const category = uniq('知识分类')

  const payload = () => ({
    category,
    keywords: '招聘, 面试, 薪酬',
    tags: 'HR, 流程',
    notes: 'E2E 测试备注',
  })

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/knowledge/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/knowledge', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/knowledge')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201，带 id 与 createdById', async () => {
    const r = await api('POST', '/api/knowledge', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.category).toBe(category)
    expect(r.data.keywords).toBe('招聘, 面试, 薪酬')
    expect(r.data.createdById).toBeGreaterThan(0)
    expect(Array.isArray(r.data.tags)).toBe(true)
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/knowledge/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/knowledge/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/knowledge')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200，改动被持久化', async () => {
    const r = await api('PUT', `/api/knowledge/${id}`, {
      ...payload(),
      keywords: '改后关键词',
    })
    expect(r.status).toBe(200)
    expect(r.data.keywords).toBe('改后关键词')
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/knowledge/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/knowledge')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
