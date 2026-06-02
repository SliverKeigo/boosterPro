import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { dictType: { findMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { GET, POST } from '@/app/api/dict-types/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/dict-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('GET /api/dict-types', () => {
  it('管理员 → 返回 {data}', async () => {
    mock(prisma.dictType.findMany).mockResolvedValue([{ id: 1, code: 'A' }])
    const res = await GET()
    expect(requireAdmin).toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1, code: 'A' }] })
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await GET()
    expect(res.status).toBe(403)
    expect(prisma.dictType.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/dict-types', () => {
  it('合法 → 201', async () => {
    mock(prisma.dictType.create).mockResolvedValue({ id: 10, code: 'GENDER', name: '性别' })
    const res = await post({ code: 'GENDER', name: '性别', remark: '备注' })
    expect(res.status).toBe(201)
    const args = mock(prisma.dictType.create).mock.calls[0][0]
    expect(args.data).toMatchObject({ code: 'GENDER', name: '性别', remark: '备注' })
  })

  it('code 为空 → 400', async () => {
    const res = await post({ code: '  ', name: '性别' })
    expect(res.status).toBe(400)
    expect(prisma.dictType.create).not.toHaveBeenCalled()
  })

  it('name 为空 → 400', async () => {
    const res = await post({ code: 'GENDER', name: '' })
    expect(res.status).toBe(400)
    expect(prisma.dictType.create).not.toHaveBeenCalled()
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, '仅管理员可执行该操作'))
    const res = await post({ code: 'GENDER', name: '性别' })
    expect(res.status).toBe(403)
    expect(prisma.dictType.create).not.toHaveBeenCalled()
  })
})
