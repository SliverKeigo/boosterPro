import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    department: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
  getSessionPayload: vi.fn(async () => ({ userId: 1 })),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin, getSessionPayload } from '@/lib/permissions'
import { GET, POST } from '@/app/api/departments/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue(admin)
})

describe('GET /api/departments', () => {
  // 注意：departments 的 GET 无守卫（候选人页下拉依赖），任意调用方都返回全量部门 + 用户数
  it('返回 { data, total }（无 requireAdmin 守卫）', async () => {
    mock(prisma.department.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET(new Request('http://t/api/departments'))
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
    const args = mock(prisma.department.findMany).mock.calls[0][0]
    expect(args.include).toEqual({ _count: { select: { users: true } }, hiddenRulesAsSource: { select: { resource: true, hiddenFromDeptId: true } } })
  })

  it('未登录 → 401，不查库', async () => {
    mock(getSessionPayload).mockResolvedValueOnce(null)
    const res = await GET(new Request('http://t/api/departments'))
    expect(res.status).toBe(401)
    expect(prisma.department.findMany).not.toHaveBeenCalled()
  })

  it('带 ?q= → 后端按部门名模糊过滤；无 q → 不带 where', async () => {
    mock(prisma.department.findMany).mockResolvedValue([])
    await GET(new Request('http://t/api/departments?q=研发'))
    expect(mock(prisma.department.findMany).mock.calls[0][0].where).toEqual({
      name: { contains: '研发', mode: 'insensitive' },
    })
    mock(prisma.department.findMany).mockClear()
    await GET(new Request('http://t/api/departments'))
    expect(mock(prisma.department.findMany).mock.calls[0][0].where).toBeUndefined()
  })
})

describe('POST /api/departments', () => {
  const makeReq = (body: unknown) =>
    new Request('http://t/api/departments', { method: 'POST', body: JSON.stringify(body) })

  it('管理员创建：调用 prisma.department.create，返回 201', async () => {
    mock(prisma.department.create).mockResolvedValue({ id: 10, name: '研发部' })
    const res = await POST(makeReq({ name: '研发部' }))
    expect(requireAdmin).toHaveBeenCalled()
    expect(mock(prisma.department.create).mock.calls[0][0].data).toEqual({ name: '研发部' })
    expect(res.status).toBe(201)
  })

  it('非管理员 → 403（关键安全断言），不写库', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await POST(makeReq({ name: '研发部' }))
    expect(res.status).toBe(403)
    expect(prisma.department.create).not.toHaveBeenCalled()
  })

  it('未登录 → 401', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await POST(makeReq({ name: '研发部' }))
    expect(res.status).toBe(401)
  })

  it('缺少 name → 400，不写库', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect(prisma.department.create).not.toHaveBeenCalled()
  })
})
