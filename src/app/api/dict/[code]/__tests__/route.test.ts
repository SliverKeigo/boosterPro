import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dictType: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { GET } from '@/app/api/dict/[code]/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const params = { params: Promise.resolve({ code: 'GENDER' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mock(getCurrentUser).mockResolvedValue(user)
})

describe('GET /api/dict/[code]', () => {
  it('登录用户按 code 取启用字典项，返回 {data}', async () => {
    const items = [{ id: 1, label: '男', value: 'M', sort: 0 }]
    mock(prisma.dictType.findUnique).mockResolvedValue({ id: 1, code: 'GENDER', items })
    const res = await GET(new Request('http://t'), params)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: items })
    // 按 code 查询，且只取 enabled 项
    const args = mock(prisma.dictType.findUnique).mock.calls[0][0]
    expect(args.where).toEqual({ code: 'GENDER' })
    expect(args.include.items.where).toEqual({ enabled: true })
  })

  it('类型不存在 → 返回空数组 {data:[]}', async () => {
    mock(prisma.dictType.findUnique).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), params)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [] })
  })

  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET(new Request('http://t'), params)
    expect(res.status).toBe(401)
    expect(prisma.dictType.findUnique).not.toHaveBeenCalled()
  })
})
