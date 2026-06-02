import { describe, it, expect, vi, beforeEach } from 'vitest'

// 本路由有自己的本地 requireAdmin()，内部调用 getCurrentUser()——因此 mock getCurrentUser 即可控制守卫。
vi.mock('@/lib/prisma', () => ({
  prisma: {
    permissionGroup: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { GET, POST } from '@/app/api/permission-groups/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(getCurrentUser).mockResolvedValue(admin)
})

describe('GET /api/permission-groups', () => {
  it('管理员：返回 { data }（含 members），支持 ?resource 过滤', async () => {
    mock(prisma.permissionGroup.findMany).mockResolvedValue([{ id: 2 }, { id: 1 }])
    const res = await GET(new Request('http://t/api/permission-groups?resource=CANDIDATE'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 2 }, { id: 1 }] })
    const args = mock(prisma.permissionGroup.findMany).mock.calls[0][0]
    expect(args.where).toEqual({ resource: 'CANDIDATE' })
    expect(args.include).toEqual({ members: true })
  })

  it('无 resource 参数：where 为 undefined（不过滤）', async () => {
    mock(prisma.permissionGroup.findMany).mockResolvedValue([])
    await GET(new Request('http://t/api/permission-groups'))
    expect(mock(prisma.permissionGroup.findMany).mock.calls[0][0].where).toBeUndefined()
  })

  it('非管理员 → 403（GET 也是 admin-only），不查库', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    const res = await GET(new Request('http://t/api/permission-groups'))
    expect(res.status).toBe(403)
    expect(prisma.permissionGroup.findMany).not.toHaveBeenCalled()
  })

  it('未登录 → 403（route 对 null 也抛 403）', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET(new Request('http://t/api/permission-groups'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/permission-groups', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t/api/permission-groups', { method: 'POST', body: JSON.stringify(body) })

  it('管理员创建（指定成员）：归一化 members 后 create，返回 201', async () => {
    mock(prisma.permissionGroup.create).mockResolvedValue({ id: 10 })
    const res = await POST(
      makeReq({
        name: '组A',
        resource: 'CANDIDATE',
        actions: ['VIEW', 'CREATE'],
        applyToAll: false,
        members: [{ memberType: 'USER', memberId: '7' }],
      }),
    )
    const args = mock(prisma.permissionGroup.create).mock.calls[0][0]
    expect(args.data.name).toBe('组A')
    expect(args.data.resource).toBe('CANDIDATE')
    expect(args.data.actions).toEqual(['VIEW', 'CREATE'])
    expect(args.data.applyToAll).toBe(false)
    // memberId 经 Number() 归一化
    expect(args.data.members).toEqual({ create: [{ memberType: 'USER', memberId: 7 }] })
    expect(args.include).toEqual({ members: true })
    expect(res.status).toBe(201)
  })

  it('applyToAll=true：强制空 members', async () => {
    mock(prisma.permissionGroup.create).mockResolvedValue({ id: 11 })
    const res = await POST(
      makeReq({
        name: '全员组',
        resource: 'CANDIDATE',
        actions: ['VIEW'],
        applyToAll: true,
        members: [{ memberType: 'USER', memberId: 7 }],
      }),
    )
    const args = mock(prisma.permissionGroup.create).mock.calls[0][0]
    expect(args.data.applyToAll).toBe(true)
    expect(args.data.members).toEqual({ create: [] })
    expect(res.status).toBe(201)
  })

  it('非管理员 → 403（关键安全断言），不写库', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    const res = await POST(makeReq({ name: '组A', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }))
    expect(res.status).toBe(403)
    expect(prisma.permissionGroup.create).not.toHaveBeenCalled()
  })

  it('未登录 → 403', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await POST(makeReq({ name: '组A', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }))
    expect(res.status).toBe(403)
  })

  it('空名称 → 400，不写库', async () => {
    const res = await POST(makeReq({ name: '  ', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }))
    expect(res.status).toBe(400)
    expect(prisma.permissionGroup.create).not.toHaveBeenCalled()
  })

  it('非法资源 → 400', async () => {
    const res = await POST(makeReq({ name: '组A', resource: 'NOPE', actions: ['VIEW'], applyToAll: false }))
    expect(res.status).toBe(400)
  })

  it('非法动作 → 400', async () => {
    const res = await POST(makeReq({ name: '组A', resource: 'CANDIDATE', actions: ['FLY'], applyToAll: false }))
    expect(res.status).toBe(400)
  })

  it('applyToAll 非布尔 → 400', async () => {
    const res = await POST(makeReq({ name: '组A', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('非法成员类型 → 400', async () => {
    const res = await POST(
      makeReq({
        name: '组A',
        resource: 'CANDIDATE',
        actions: ['VIEW'],
        applyToAll: false,
        members: [{ memberType: 'ALIEN', memberId: 1 }],
      }),
    )
    expect(res.status).toBe(400)
    expect(prisma.permissionGroup.create).not.toHaveBeenCalled()
  })

  it('非法成员 ID → 400', async () => {
    const res = await POST(
      makeReq({
        name: '组A',
        resource: 'CANDIDATE',
        actions: ['VIEW'],
        applyToAll: false,
        members: [{ memberType: 'USER', memberId: 0 }],
      }),
    )
    expect(res.status).toBe(400)
  })
})
