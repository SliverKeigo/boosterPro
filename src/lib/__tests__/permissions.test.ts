import { describe, it, expect, vi, beforeEach } from 'vitest'

// React cache() 在非 RSC 环境会缓存 getCurrentUser 的结果，导致跨用例串味；mock 成直通。
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    permissionGroup: { findMany: vi.fn() },
  },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/auth', () => ({ verifyToken: vi.fn(), AUTH_COOKIE: 'bp_token' }))

import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import {
  isOwnerOrAdmin,
  assertRowWritable,
  getPermissionMap,
  hasAction,
  requirePermission,
  requireAdmin,
} from '@/lib/permissions'
import { HttpError } from '@/lib/apiError'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }

const setCookie = (token?: string) =>
  (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: () => (token ? { value: token } : undefined),
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isOwnerOrAdmin / assertRowWritable（纯函数行级归属）', () => {
  it('创建者本人可写', () => {
    expect(isOwnerOrAdmin(normal, { createdById: 2 })).toBe(true)
  })
  it('管理员可写任意行', () => {
    expect(isOwnerOrAdmin(admin, { createdById: 999 })).toBe(true)
  })
  it('非创建者不可写', () => {
    expect(isOwnerOrAdmin(normal, { createdById: 3 })).toBe(false)
    expect(isOwnerOrAdmin(normal, null)).toBe(false)
  })
  it('assertRowWritable：行不存在抛 404', () => {
    expect(() => assertRowWritable(normal, null)).toThrow(HttpError)
    try {
      assertRowWritable(normal, null)
    } catch (e) {
      expect((e as HttpError).status).toBe(404)
    }
  })
  it('assertRowWritable：他人数据抛 403', () => {
    try {
      assertRowWritable(normal, { createdById: 3 })
    } catch (e) {
      expect((e as HttpError).status).toBe(403)
    }
  })
})

describe('getPermissionMap / hasAction', () => {
  it('管理员拥有全部资源全部动作，且不查库', async () => {
    const map = await getPermissionMap(admin)
    expect(map.CANDIDATE).toEqual(
      expect.arrayContaining(['VIEW', 'CREATE', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT']),
    )
    // 新增资源也应被管理员全量覆盖
    expect(map.CUSTOMER_CONTACT).toEqual(
      expect.arrayContaining(['VIEW', 'CREATE', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT']),
    )
    expect(prisma.permissionGroup.findMany).not.toHaveBeenCalled()
  })
  it('普通用户取匹配权限组动作并集', async () => {
    ;(prisma.permissionGroup.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { resource: 'CANDIDATE', actions: ['VIEW', 'CREATE'] },
      { resource: 'CANDIDATE', actions: ['EDIT'] },
      { resource: 'KNOWLEDGE', actions: ['VIEW'] },
    ])
    const map = await getPermissionMap(normal)
    expect(new Set(map.CANDIDATE)).toEqual(new Set(['VIEW', 'CREATE', 'EDIT']))
    expect(map.KNOWLEDGE).toEqual(['VIEW'])
    // OR 条件覆盖 全部用户/本人/部门/角色
    const where = (prisma.permissionGroup.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where
    expect(where.OR).toHaveLength(4)
  })
  it('hasAction 反映 map', async () => {
    ;(prisma.permissionGroup.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { resource: 'CANDIDATE', actions: ['VIEW'] },
    ])
    expect(await hasAction(normal, 'CANDIDATE', 'VIEW')).toBe(true)
    expect(await hasAction(normal, 'CANDIDATE', 'DELETE')).toBe(false)
  })
})

describe('requirePermission / requireAdmin（守卫）', () => {
  it('无 token → 401', async () => {
    setCookie(undefined)
    await expect(requirePermission('CANDIDATE', 'VIEW')).rejects.toMatchObject({ status: 401 })
  })
  it('缺少动作权限 → 403', async () => {
    setCookie('tok')
    ;(verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 2 })
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(normal)
    ;(prisma.permissionGroup.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { resource: 'CANDIDATE', actions: ['VIEW'] },
    ])
    await expect(requirePermission('CANDIDATE', 'DELETE')).rejects.toMatchObject({ status: 403 })
  })
  it('管理员直接通过', async () => {
    setCookie('tok')
    ;(verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 1 })
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(admin)
    await expect(requirePermission('CANDIDATE', 'DELETE')).resolves.toMatchObject({ id: 1 })
  })
  it('requireAdmin 对普通用户 → 403', async () => {
    setCookie('tok')
    ;(verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 2 })
    ;(prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(normal)
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 })
  })
  it('requireAdmin 无 token → 401', async () => {
    setCookie(undefined)
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 })
  })
})
