import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { aiPrompt: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, PUT, DELETE } from '@/app/api/ai-prompts/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('GET /api/ai-prompts', () => {
  it('库为空 → 列出内置 key（overridden=false）', async () => {
    mock(prisma.aiPrompt.findMany).mockResolvedValue([])
    const res = await GET()
    const body = await res.json()
    const keys = body.data.map((d: any) => d.key)
    expect(keys).toEqual(expect.arrayContaining(['job_profile', 'company_info', 'supplement_opening']))
    expect(body.data.every((d: any) => d.overridden === false)).toBe(true)
  })

  it('某 key 有库覆盖 → overridden=true 且用库内容', async () => {
    mock(prisma.aiPrompt.findMany).mockResolvedValue([{ id: 9, key: 'company_info', name: '自定义', content: 'X', description: null, updatedAt: new Date(0) }])
    const res = await GET()
    const body = await res.json()
    const ci = body.data.find((d: any) => d.key === 'company_info')
    expect(ci.overridden).toBe(true)
    expect(ci.content).toBe('X')
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/ai-prompts', () => {
  it('upsert 保存覆盖', async () => {
    mock(prisma.aiPrompt.upsert).mockResolvedValue({ id: 1, key: 'company_info' })
    const res = await PUT(new Request('http://t/api/ai-prompts', { method: 'PUT', body: JSON.stringify({ key: 'company_info', name: 'n', content: 'c' }) }))
    expect(res.status).toBe(200)
    expect(mock(prisma.aiPrompt.upsert).mock.calls[0][0].where).toEqual({ key: 'company_info' })
  })
  it('内容空 → 400', async () => {
    const res = await PUT(new Request('http://t/api/ai-prompts', { method: 'PUT', body: JSON.stringify({ key: 'x', content: '' }) }))
    expect(res.status).toBe(400)
    expect(prisma.aiPrompt.upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/ai-prompts', () => {
  it('?key= → 删除覆盖（恢复默认）', async () => {
    mock(prisma.aiPrompt.deleteMany).mockResolvedValue({ count: 1 })
    const res = await DELETE(new Request('http://t/api/ai-prompts?key=company_info', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(prisma.aiPrompt.deleteMany).toHaveBeenCalledWith({ where: { key: 'company_info' } })
  })
  it('缺 key → 400', async () => {
    const res = await DELETE(new Request('http://t/api/ai-prompts', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
})
