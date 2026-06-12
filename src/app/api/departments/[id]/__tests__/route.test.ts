import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    department: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    departmentHiddenResource: { deleteMany: vi.fn(), createMany: vi.fn() },
    user: { count: vi.fn() },
  }
  // $transaction(cb) 执行回调并把 prisma 本身当作事务客户端 tx
  prisma.$transaction = vi.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  getSessionPayload: vi.fn(async () => ({ userId: 1 })),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin, requirePermission } from '@/lib/permissions'
import { GET, PUT, DELETE } from '@/app/api/departments/[id]/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
  mock(requirePermission).mockResolvedValue(admin)
})

describe('GET /api/departments/[id]', () => {
  // GET 仅登录校验
  it('返回部门（无 requirePermission 守卫）', async () => {
    mock(prisma.department.findUnique).mockResolvedValue({ id: 1, name: '研发部' })
    const res = await GET(new Request('http://t'), ctx('1'))
    expect(requirePermission).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(mock(prisma.department.findUnique).mock.calls[0][0].where).toEqual({ id: 1 })
  })

  it('找不到 → 404', async () => {
    mock(prisma.department.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), ctx('999'))
    expect(res.status).toBe(404)
  })

  it('非法 ID → 400', async () => {
    const res = await GET(new Request('http://t'), ctx('abc'))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/departments/[id]', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t', { method: 'PUT', body: JSON.stringify(body) })

  it('有 SYS_DEPARTMENT.EDIT 权限：事务内 update name，返回 200', async () => {
    mock(prisma.department.update).mockResolvedValue({ id: 1, name: '改' })
    mock(prisma.department.findUnique).mockResolvedValue({ id: 1, name: '改', hiddenRulesAsSource: [] })
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(requirePermission).toHaveBeenCalledWith('SYS_DEPARTMENT', 'EDIT')
    const args = mock(prisma.department.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data).toEqual({ name: '改' })
    expect(res.status).toBe(200)
  })

  it('传 blocks：事务内重写定向黑名单，非法 resource 被过滤', async () => {
    mock(prisma.department.update).mockResolvedValue({ id: 1, name: '改' })
    mock(prisma.department.findUnique).mockResolvedValue({ id: 1, name: '改', hiddenRulesAsSource: [] })
    const res = await PUT(
      makeReq({ name: '改', blocks: [{ resource: 'CANDIDATE', hiddenFromDeptId: 2 }, { resource: 'BAD', hiddenFromDeptId: 3 }] }),
      ctx('1'),
    )
    expect(res.status).toBe(200)
    expect(prisma.departmentHiddenResource.deleteMany).toHaveBeenCalledWith({ where: { departmentId: 1 } })
    const createArgs = mock(prisma.departmentHiddenResource.createMany).mock.calls[0][0]
    expect(createArgs.data).toEqual([{ departmentId: 1, resource: 'CANDIDATE', hiddenFromDeptId: 2 }])
  })

  it('无权限 → 403（关键安全断言），不写库', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.department.update).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await PUT(makeReq({ name: '改' }), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('缺少 name → 400，不写库', async () => {
    const res = await PUT(makeReq({}), ctx('1'))
    expect(res.status).toBe(400)
    expect(prisma.department.update).not.toHaveBeenCalled()
  })

  it('非法 ID → 400', async () => {
    const res = await PUT(makeReq({ name: '改' }), ctx('0'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/departments/[id]', () => {
  const makeReq = () => new Request('http://t', { method: 'DELETE' })

  it('有 SYS_DEPARTMENT.DELETE 权限（无关联用户）：调用 prisma.department.delete，返回 success', async () => {
    mock(prisma.user.count).mockResolvedValue(0)
    mock(prisma.department.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(makeReq(), ctx('1'))
    expect(requirePermission).toHaveBeenCalledWith('SYS_DEPARTMENT', 'DELETE')
    expect(mock(prisma.user.count).mock.calls[0][0]).toEqual({ where: { departmentId: 1 } })
    expect(mock(prisma.department.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('部门下仍有用户 → 400，不删除', async () => {
    mock(prisma.user.count).mockResolvedValue(2)
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(400)
    expect(prisma.department.delete).not.toHaveBeenCalled()
  })

  it('无权限 → 403（关键安全断言），不删除', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '您没有执行该操作的权限'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(prisma.department.delete).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await DELETE(makeReq(), ctx('1'))
    expect(res.status).toBe(401)
  })

  it('非法 ID → 400', async () => {
    const res = await DELETE(makeReq(), ctx('-1'))
    expect(res.status).toBe(400)
    expect(prisma.department.delete).not.toHaveBeenCalled()
  })
})
