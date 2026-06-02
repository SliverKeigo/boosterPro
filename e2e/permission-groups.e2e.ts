import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, anon, listOf, login, uniq } from './_client'

// 真实打 dev server + 真库的权限组 CRUD（自建自删）。
// 路由 src/app/api/permission-groups/route.ts + [id]/route.ts，模型 PermissionGroup
//   （name VarChar(200), resource(RESOURCE key), actions(ACTION key[]), applyToAll bool,
//     members[] {memberType: USER|DEPARTMENT|ROLE, memberId}）。
// 守卫 requireAdmin → 匿名 401。
// 注意：本路由没有 GET [id]（只有 GET 列表 ?resource=、POST、PUT[id]、DELETE[id]），
//       因此用 ?resource= 过滤列表核对存在性与字段。
describe('E2E 权限组 全 CRUD', () => {
  let id = 0
  let ownerId = 0
  const name = uniq('权限组')
  const resource = 'CANDIDATE' // ∈ RESOURCE_KEYS

  beforeAll(async () => {
    await login()
    const me = await api('GET', '/api/auth/me')
    expect(me.status).toBe(200)
    ownerId = me.data.id // 用作 USER 成员 id
    expect(ownerId).toBeGreaterThan(0)
  })

  afterAll(async () => {
    if (id) await api('DELETE', `/api/permission-groups/${id}`)
  })

  it('未登录写操作被拦截 (401)', async () => {
    const r = await anon('POST', '/api/permission-groups', { name, resource, actions: ['VIEW'], applyToAll: true })
    expect(r.status).toBe(401)
  })

  it('GET 列表 → 200 数组', async () => {
    const r = await api('GET', '/api/permission-groups')
    expect(r.status).toBe(200)
    expect(Array.isArray(listOf(r))).toBe(true)
  })

  it('POST 新建 (applyToAll=true, 空成员) → 201 带 id', async () => {
    const r = await api('POST', '/api/permission-groups', {
      name,
      resource,
      actions: ['VIEW', 'CREATE'],
      applyToAll: true,
    })
    expect(r.status).toBe(201)
    id = r.data.id
    expect(id).toBeGreaterThan(0)
    expect(r.data.name).toBe(name)
    expect(r.data.resource).toBe(resource)
    expect(r.data.actions).toEqual(['VIEW', 'CREATE'])
    expect(r.data.applyToAll).toBe(true)
    // applyToAll=true 时路由强制空成员
    expect(Array.isArray(r.data.members)).toBe(true)
    expect(r.data.members.length).toBe(0)
  })

  it('POST 空名 → 400', async () => {
    const r = await api('POST', '/api/permission-groups', { name: '', resource, actions: ['VIEW'], applyToAll: true })
    expect(r.status).toBe(400)
  })

  it('POST 非法资源 → 400', async () => {
    const r = await api('POST', '/api/permission-groups', { name: uniq('权限组'), resource: 'NOPE', actions: ['VIEW'], applyToAll: true })
    expect(r.status).toBe(400)
  })

  it('POST 非法动作 → 400', async () => {
    const r = await api('POST', '/api/permission-groups', { name: uniq('权限组'), resource, actions: ['FLY'], applyToAll: true })
    expect(r.status).toBe(400)
  })

  it('POST applyToAll 非布尔 → 400', async () => {
    const r = await api('POST', '/api/permission-groups', { name: uniq('权限组'), resource, actions: ['VIEW'], applyToAll: 'yes' })
    expect(r.status).toBe(400)
  })

  it('新建项出现在 ?resource= 过滤列表', async () => {
    const r = await api('GET', `/api/permission-groups?resource=${resource}`)
    expect(r.status).toBe(200)
    const found = listOf(r).find((d) => d.id === id)
    expect(found).toBeTruthy()
    expect(found.resource).toBe(resource)
  })

  it('PUT 更新 actions 并指定成员 (applyToAll=false, USER 成员) → 200', async () => {
    const r = await api('PUT', `/api/permission-groups/${id}`, {
      name: `${name}_改`,
      resource,
      actions: ['VIEW', 'EDIT', 'DELETE'],
      applyToAll: false,
      members: [{ memberType: 'USER', memberId: ownerId }],
    })
    expect(r.status).toBe(200)
    expect(r.data.name).toBe(`${name}_改`)
    expect(r.data.actions).toEqual(['VIEW', 'EDIT', 'DELETE'])
    expect(r.data.applyToAll).toBe(false)
    expect(r.data.members.length).toBe(1)
    expect(r.data.members[0].memberType).toBe('USER')
    expect(r.data.members[0].memberId).toBe(ownerId)
  })

  it('PUT 非法成员类型 → 400', async () => {
    const r = await api('PUT', `/api/permission-groups/${id}`, {
      name,
      resource,
      actions: ['VIEW'],
      applyToAll: false,
      members: [{ memberType: 'ALIEN', memberId: ownerId }],
    })
    expect(r.status).toBe(400)
  })

  it('DELETE 删除 → 200，且 ?resource= 列表不再包含', async () => {
    const r = await api('DELETE', `/api/permission-groups/${id}`)
    expect(r.status).toBe(200)
    const after = await api('GET', `/api/permission-groups?resource=${resource}`)
    expect(listOf(after).some((d) => d.id === id)).toBe(false)
    id = 0
  })
})
