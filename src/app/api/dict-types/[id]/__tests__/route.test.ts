import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { dictType: { update: vi.fn(), delete: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn(), requirePermission: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin, requirePermission } from '@/lib/permissions'
import { PUT, DELETE } from '@/app/api/dict-types/[id]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

const put = (body: unknown, id = '1') =>
  PUT(
    new Request('http://t/api/dict-types/' + id, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    ctx(id),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
  mock(requirePermission).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('PUT /api/dict-types/[id]', () => {
  it('合法 → 200', async () => {
    mock(prisma.dictType.update).mockResolvedValue({ id: 1, code: 'A', name: '甲' })
    const res = await put({ code: 'A', name: '甲', remark: 'r' })
    expect(requirePermission).toHaveBeenCalledWith('SYS_DICT', 'EDIT')
    expect(res.status).toBe(200)
    const args = mock(prisma.dictType.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data).toMatchObject({ code: 'A', name: '甲' })
  })

  it('非法 ID → 400', async () => {
    const res = await put({ code: 'A', name: '甲' }, 'abc')
    expect(res.status).toBe(400)
    expect(prisma.dictType.update).not.toHaveBeenCalled()
  })

  it('name 为空 → 400', async () => {
    const res = await put({ code: 'A', name: '' })
    expect(res.status).toBe(400)
    expect(prisma.dictType.update).not.toHaveBeenCalled()
  })

  it('无权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await put({ code: 'A', name: '甲' })
    expect(res.status).toBe(403)
    expect(prisma.dictType.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/dict-types/[id]', () => {
  it('合法 → success', async () => {
    mock(prisma.dictType.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t/api/dict-types/1'), ctx('1'))
    expect(requirePermission).toHaveBeenCalledWith('SYS_DICT', 'DELETE')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mock(prisma.dictType.delete).mock.calls[0][0]).toEqual({ where: { id: 1 } })
  })

  it('非法 ID → 400', async () => {
    const res = await DELETE(new Request('http://t/api/dict-types/0'), ctx('0'))
    expect(res.status).toBe(400)
    expect(prisma.dictType.delete).not.toHaveBeenCalled()
  })

  it('无权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, 'x'))
    const res = await DELETE(new Request('http://t/api/dict-types/1'), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.dictType.delete).not.toHaveBeenCalled()
  })
})
