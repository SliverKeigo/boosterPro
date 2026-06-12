import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dictItem: { findMany: vi.fn(), create: vi.fn() },
    dictType: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn(), requirePermission: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin, requirePermission } from '@/lib/permissions'
import { GET, POST } from '@/app/api/dict-items/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/dict-items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
  mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('GET /api/dict-items', () => {
  it('合法 typeId → 返回 {data}', async () => {
    mock(prisma.dictItem.findMany).mockResolvedValue([{ id: 1, label: '男', value: 'M' }])
    const res = await GET(new Request('http://t/api/dict-items?typeId=3'))
    expect(requirePermission).toHaveBeenCalledWith('SYS_DICT', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1, label: '男', value: 'M' }] })
    expect(mock(prisma.dictItem.findMany).mock.calls[0][0].where).toEqual({ typeId: 3 })
  })

  it('缺少/非法 typeId → 400', async () => {
    const res = await GET(new Request('http://t/api/dict-items'))
    expect(res.status).toBe(400)
    expect(prisma.dictItem.findMany).not.toHaveBeenCalled()
  })

  it('无权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await GET(new Request('http://t/api/dict-items?typeId=3'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/dict-items', () => {
  it('合法 → 201（应用 sort/enabled 默认）', async () => {
    mock(prisma.dictType.findUnique).mockResolvedValue({ id: 3 })
    mock(prisma.dictItem.create).mockResolvedValue({ id: 9 })
    const res = await post({ typeId: 3, label: '男', value: 'M' })
    expect(requirePermission).toHaveBeenCalledWith('SYS_DICT', 'CREATE')
    expect(res.status).toBe(201)
    const args = mock(prisma.dictItem.create).mock.calls[0][0]
    expect(args.data).toMatchObject({ typeId: 3, label: '男', value: 'M', sort: 0, enabled: true })
  })

  it('typeId 非法 → 400', async () => {
    const res = await post({ typeId: 0, label: '男', value: 'M' })
    expect(res.status).toBe(400)
    expect(prisma.dictItem.create).not.toHaveBeenCalled()
  })

  it('label 为空 → 400', async () => {
    const res = await post({ typeId: 3, label: ' ', value: 'M' })
    expect(res.status).toBe(400)
  })

  it('value 为空 → 400', async () => {
    const res = await post({ typeId: 3, label: '男', value: '' })
    expect(res.status).toBe(400)
  })

  it('字典类型不存在 → 404', async () => {
    mock(prisma.dictType.findUnique).mockResolvedValue(null)
    const res = await post({ typeId: 99, label: '男', value: 'M' })
    expect(res.status).toBe(404)
    expect(prisma.dictItem.create).not.toHaveBeenCalled()
  })

  it('无权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await post({ typeId: 3, label: '男', value: 'M' })
    expect(res.status).toBe(403)
    expect(prisma.dictItem.create).not.toHaveBeenCalled()
  })
})
