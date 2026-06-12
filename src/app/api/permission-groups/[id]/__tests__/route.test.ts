import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

// 守卫已换为共享的 requirePermission('SYS_PERMISSION', 动作)——mock requirePermission 即可控制守卫。
vi.mock('@/lib/prisma', () => ({
  prisma: {
    permissionGroup: { update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { PUT, DELETE } from '@/app/api/permission-groups/[id]/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(admin)
})

describe('PUT /api/permission-groups/[id]', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t', { method: 'PUT', body: JSON.stringify(body) })

  it('有 SYS_PERMISSION.EDIT 权限：members 整体重建（deleteMany + create），返回 200', async () => {
    mock(prisma.permissionGroup.update).mockResolvedValue({ id: 1 })
    const res = await PUT(
      makeReq({
        name: '组改',
        resource: 'CANDIDATE',
        actions: ['VIEW', 'EDIT'],
        applyToAll: false,
        members: [{ memberType: 'ROLE', memberId: '3' }],
      }),
      ctx('1'),
    )
    expect(requirePermission).toHaveBeenCalledWith('SYS_PERMISSION', 'EDIT')
    const args = mock(prisma.permissionGroup.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data.name).toBe('组改')
    expect(args.data.actions).toEqual(['VIEW', 'EDIT'])
    expect(args.data.members).toEqual({
      deleteMany: {},
      create: [{ memberType: 'ROLE', memberId: 3 }],
    })
    expect(res.status).toBe(200)
  })

  it('applyToAll=true：members 重建为空', async () => {
    mock(prisma.permissionGroup.update).mockResolvedValue({ id: 1 })
    await PUT(
      makeReq({
        name: '全员',
        resource: 'CANDIDATE',
        actions: ['VIEW'],
        applyToAll: true,
        members: [{ memberType: 'USER', memberId: 7 }],
      }),
      ctx('1'),
    )
    const args = mock(prisma.permissionGroup.update).mock.calls[0][0]
    expect(args.data.applyToAll).toBe(true)
    expect(args.data.members).toEqual({ deleteMany: {}, create: [] })
  })

  it('无权限 → 403（关键安全断言），不写库', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await PUT(
      makeReq({ name: '组改', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }),
      ctx('1'),
    )
    expect(res.status).toBe(403)
    expect(prisma.permissionGroup.update).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await PUT(
      makeReq({ name: '组改', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }),
      ctx('1'),
    )
    expect(res.status).toBe(401)
  })

  it('空名称 → 400，不写库', async () => {
    const res = await PUT(
      makeReq({ name: '', resource: 'CANDIDATE', actions: ['VIEW'], applyToAll: false }),
      ctx('1'),
    )
    expect(res.status).toBe(400)
    expect(prisma.permissionGroup.update).not.toHaveBeenCalled()
  })

  it('非法资源 → 400', async () => {
    const res = await PUT(
      makeReq({ name: '组改', resource: 'XXX', actions: ['VIEW'], applyToAll: false }),
      ctx('1'),
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/permission-groups/[id]', () => {
  const makeReq = () => new Request('http://t', { method: 'DELETE' })

  it('有 SYS_PERMISSION.DELETE 权限：调用 prisma.permissionGroup.delete，返回 success', async () => {
    mock(prisma.permissionGroup.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(makeReq(), ctx('1'))
    expect(requirePermission).toHaveBeenCalledWith('SYS_PERMISSION', 'DELETE')
    expect(mock(prisma.permissionGroup.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('无权限 → 403（关键安全断言），不删除', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.permissionGroup.delete).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(401)
  })
})
