import { describe, it, expect, vi, beforeEach } from 'vitest'

// $transaction 为回调式：用同一个 prisma mock 当 tx，使 tx.group.create 等即 mock 自身
vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    group: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    user: { updateMany: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  getSessionPayload: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin, requirePermission, getSessionPayload } from '@/lib/permissions'
import { GET, POST } from '@/app/api/groups/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const post = (body: unknown) =>
  POST(new Request('http://t/api/groups', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
  mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
  mock(getSessionPayload).mockResolvedValue({ userId: 1 })
})

describe('GET /api/groups', () => {
  it('未登录 → 401', async () => {
    mock(getSessionPayload).mockResolvedValueOnce(null)
    const res = await GET(new Request('http://t/api/groups'))
    expect(res.status).toBe(401)
  })
  it('登录 → 返回 {data,total}', async () => {
    mock(prisma.group.findMany).mockResolvedValue([{ id: 1, name: '交付一组' }])
    const res = await GET(new Request('http://t/api/groups'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1, name: '交付一组' }], total: 1 })
  })
})

describe('POST /api/groups', () => {
  it('缺组名 → 400，不建组', async () => {
    const res = await post({ departmentId: 2, memberIds: [3] })
    expect(res.status).toBe(400)
    expect(prisma.group.create).not.toHaveBeenCalled()
  })

  it('缺部门 → 400', async () => {
    const res = await post({ name: 'A组', memberIds: [3] })
    expect(res.status).toBe(400)
  })

  it('组长不在成员里 → 400', async () => {
    const res = await post({ name: 'A组', departmentId: 2, leaderId: 99, memberIds: [3, 4] })
    expect(res.status).toBe(400)
    expect(prisma.group.create).not.toHaveBeenCalled()
  })

  it('合法 → 建组 + 成员 groupId 指向新组，201', async () => {
    mock(prisma.group.create).mockResolvedValue({ id: 10, name: 'A组' })
    const res = await post({ name: 'A组', departmentId: 2, leaderId: 3, memberIds: [3, 4] })
    expect(requirePermission).toHaveBeenCalledWith('SYS_GROUP', 'CREATE')
    expect(res.status).toBe(201)
    expect(prisma.group.create).toHaveBeenCalledWith({
      data: { name: 'A组', departmentId: 2, leaderId: 3 },
    })
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: [3, 4] } }, data: { groupId: 10 } })
  })
})
