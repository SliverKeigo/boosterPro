import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { candidate: { findMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(),
  assertRowWritable: vi.fn(),
}))
// 解耦数据构造器：路由只负责编排与归属，构造逻辑在 candidateData 自己的单测里覆盖。
vi.mock('@/lib/candidateData', () => ({
  CANDIDATE_INCLUDE: {},
  CANDIDATE_LIST_INCLUDE: {},
  buildCandidateData: vi.fn(() => ({})),
  assertCandidateUnique: vi.fn(),
  normalizePhone: vi.fn((p: string) => p),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { GET, POST } from '@/app/api/candidates/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(user)
})

describe('GET /api/candidates', () => {
  it('校验 VIEW 权限并返回 {data,total}', async () => {
    mock(prisma.candidate.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requirePermission).toHaveBeenCalledWith('CANDIDATE', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/candidates', () => {
  it('校验 CREATE，写入 createdById，返回 201', async () => {
    mock(prisma.candidate.create).mockResolvedValue({ id: 10 })
    const req = new Request('http://t/api/candidates', {
      method: 'POST',
      body: JSON.stringify({ name: '张三' }),
    })
    const res = await POST(req)
    expect(requirePermission).toHaveBeenCalledWith('CANDIDATE', 'CREATE')
    const args = mock(prisma.candidate.create).mock.calls[0][0]
    expect(args.data.createdById).toBe(7)
    expect(res.status).toBe(201)
  })

  it('无 CREATE 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/candidates', { method: 'POST', body: '{}' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
