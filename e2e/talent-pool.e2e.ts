import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的人才储备库 CRUD（自建自删，不留垃圾）。
// TalentPool 必填(非空无默认)：name / currentPosition / resumeUrl。无外键依赖。
describe('E2E 人才储备库 全 CRUD', () => {
  let id = 0
  const name = uniq('人才')

  const payload = () => ({
    name,
    currentPosition: '高级前端工程师',
    resumeUrl: `/files/${uniq('resume')}.pdf`,
    phone: '13800000000',
    education: '本科',
    targetPosition: '前端架构师',
    positionType: '技术',
    positionLevel: 'P7',
    birthYear: 1990,
    age: 36,
    // GenderType 枚举：Prisma Client 需传枚举标识符（非 @map 的中文 DB 值）
    gender: 'MALE',
    tags: 'React, TypeScript, Next.js',
  })

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/talent-pool/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/talent-pool', payload())
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/talent-pool')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 → 201，带 id 与 createdById', async () => {
    const r = await api('POST', '/api/talent-pool', payload())
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
    expect(r.data.currentPosition).toBe('高级前端工程师')
    expect(r.data.createdById).toBeGreaterThan(0)
    // 逗号字符串 tags 应被切分为数组
    expect(Array.isArray(r.data.tags)).toBe(true)
    expect(r.data.tags).toContain('React')
  })

  it('GET 详情 → 200', async () => {
    const r = await api('GET', `/api/talent-pool/${id}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(id)
  })

  it('GET 不存在 id → 404', async () => {
    const r = await api('GET', '/api/talent-pool/99999999')
    expect(r.status).toBe(404)
  })

  it('新建项出现在列表', async () => {
    const r = await api('GET', '/api/talent-pool')
    expect(listOf(r).some((d) => d.id === id)).toBe(true)
  })

  it('PUT 更新 → 200，改动被持久化', async () => {
    const r = await api('PUT', `/api/talent-pool/${id}`, {
      ...payload(),
      currentPosition: '技术总监',
    })
    expect(r.status).toBe(200)
    expect(r.data.currentPosition).toBe('技术总监')
  })

  it('DELETE 删除 → 200，且列表不再包含', async () => {
    const r = await api('DELETE', `/api/talent-pool/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', '/api/talent-pool')
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
