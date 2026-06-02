import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的用户管理 + 权限移交（自建自删）。
describe('E2E 用户管理 + 移交', () => {
  let user1Id = 0
  let user2Id = 0
  const u1 = uniq('user1')
  const u2 = uniq('user2')
  const name1 = uniq('用户甲')
  const name2 = uniq('用户乙')

  beforeAll(async () => {
    await login()
  })

  afterAll(async () => {
    // 自清理：删除创建的两个用户
    if (user1Id) await api('DELETE', `/api/users/${user1Id}`)
    if (user2Id) await api('DELETE', `/api/users/${user2Id}`)
  })

  it('未登录 POST /api/users → 401', async () => {
    const r = await anon('POST', '/api/users', { name: name1, username: u1, password: 'Passw0rd!' })
    expect(r.status).toBe(401)
  })

  it('POST 新建用户 → 201，且响应不含 passwordHash', async () => {
    const r = await api('POST', '/api/users', { name: name1, username: u1, password: 'Passw0rd!' })
    expect(r.status).toBe(201)
    user1Id = r.data.id
    expect(user1Id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name1)
    expect(r.data.username).toBe(u1)
    expect(r.data).not.toHaveProperty('passwordHash')
  })

  it('GET 列表 → 200，新用户出现且无 passwordHash', async () => {
    const r = await api('GET', '/api/users')
    expect(r.status).toBe(200)
    const rows = listOf(r)
    expect(Array.isArray(rows)).toBe(true)
    const mine = rows.find((u) => u.id === user1Id)
    expect(mine).toBeTruthy()
    expect(mine).not.toHaveProperty('passwordHash')
  })

  it('PUT 更新姓名 → 200', async () => {
    const r = await api('PUT', `/api/users/${user1Id}`, { name: `${name1}_改` })
    expect(r.status).toBe(200)
    expect(r.data.name).toBe(`${name1}_改`)
    expect(r.data).not.toHaveProperty('passwordHash')
  })

  it('POST 缺密码 → 400', async () => {
    const r = await api('POST', '/api/users', { name: uniq('无密码'), username: uniq('nopw') })
    expect(r.status).toBe(400)
  })

  it('创建第二个用户用于移交', async () => {
    const r = await api('POST', '/api/users', { name: name2, username: u2, password: 'Passw0rd!' })
    expect(r.status).toBe(201)
    user2Id = r.data.id
    expect(user2Id).toBeGreaterThan(0)
  })

  it('移交 user1 → user2 → 200，返回 moved 计数（测试用户无数据，均为 0）', async () => {
    const r = await api('POST', `/api/users/${user1Id}/transfer`, { toUserId: user2Id })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.moved).toBeTruthy()
    // 测试用户名下不拥有任何业务数据，所有计数应为 0
    expect(r.data.moved).toMatchObject({
      candidate: 0,
      requirement: 0,
      clientSupplement: 0,
      talentPool: 0,
      opportunity: 0,
      customer: 0,
      contract: 0,
      knowledgeBase: 0,
    })
  })

  it('移交 toUserId 缺失 → 400', async () => {
    const r = await api('POST', `/api/users/${user1Id}/transfer`, {})
    expect(r.status).toBe(400)
  })

  it('移交 源=目标 → 400', async () => {
    const r = await api('POST', `/api/users/${user1Id}/transfer`, { toUserId: user1Id })
    expect(r.status).toBe(400)
  })
})
