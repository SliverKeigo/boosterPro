import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: { findMany: vi.fn() },
    requirement: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { GET } from '@/app/api/reports/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(user)
})

describe('GET /api/reports', () => {
  it('校验 REPORT VIEW 并返回 {candidates,requirements}', async () => {
    const candidates = [{ id: 1, recommendationStatus: 'NEW' }]
    const requirements = [{ id: 2, status: 'OPEN' }]
    mock(prisma.candidate.findMany).mockResolvedValue(candidates)
    mock(prisma.requirement.findMany).mockResolvedValue(requirements)
    const res = await GET()
    expect(requirePermission).toHaveBeenCalledWith('REPORT', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ candidates, requirements })
  })

  it('仅 select 非敏感字段，不泄露 PII', async () => {
    mock(prisma.candidate.findMany).mockResolvedValue([])
    mock(prisma.requirement.findMany).mockResolvedValue([])
    await GET()
    const candSelect = mock(prisma.candidate.findMany).mock.calls[0][0].select
    // 显式 select 且不含 phone/email/birthYear 等 PII 字段
    expect(candSelect).toBeDefined()
    expect(candSelect.phone).toBeUndefined()
    expect(candSelect.email).toBeUndefined()
    expect(candSelect.birthYear).toBeUndefined()
    expect(candSelect.salaryPlan).toBeUndefined()
    expect(candSelect.recommendationStatus).toBe(true)
    // 候选人推荐报表明细/统计所需的非敏感字段（回归保护：勿误删，否则报表少列/统计错）
    expect(candSelect.recommendationTime).toBe(true)
    expect(candSelect.recruitmentChannel).toBe(true)
    expect(candSelect.requirement).toBeDefined()
    const reqSelect = mock(prisma.requirement.findMany).mock.calls[0][0].select
    expect(reqSelect).toBeDefined()
    expect(reqSelect.status).toBe(true)
  })

  it('无 REPORT VIEW 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
