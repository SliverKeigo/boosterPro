import { describe, it, expect, beforeAll } from 'vitest'
import { api, anon, login } from './_client'

// GET /api/dict/[code]：按字典 code 读取启用项。登录即可读。
describe('E2E 字典读取 /api/dict/[code]', () => {
  beforeAll(async () => {
    await login()
  })

  it('未登录 → 401', async () => {
    const r = await anon('GET', '/api/dict/industry')
    expect(r.status).toBe(401)
  })

  it('存在的 code (industry) → 200 返回 items 数组', async () => {
    const r = await api('GET', '/api/dict/industry')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data.data)).toBe(true)
    expect(r.data.data.length).toBeGreaterThan(0)
    const item = r.data.data[0]
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('label')
    expect(item).toHaveProperty('value')
  })

  it('存在的 code (knowledge_tag) → 200 返回 items 数组', async () => {
    const r = await api('GET', '/api/dict/knowledge_tag')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data.data)).toBe(true)
    expect(r.data.data.length).toBeGreaterThan(0)
  })

  it('不存在的 code → 200 返回空数组（route：类型不存在返回 {data: []}）', async () => {
    const r = await api('GET', '/api/dict/__nonexistent_code_E2E__')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data.data)).toBe(true)
    expect(r.data.data.length).toBe(0)
  })
})
