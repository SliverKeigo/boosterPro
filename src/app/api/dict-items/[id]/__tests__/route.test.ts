import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: { dictItem: { update: vi.fn(), delete: vi.fn() } },
}))
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/permissions'
import { PUT, DELETE } from '@/app/api/dict-items/[id]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '1') => ({ params: Promise.resolve({ id }) })

const put = (body: unknown, id = '1') =>
  PUT(
    new Request('http://t/api/dict-items/' + id, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    ctx(id),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mock(requireAdmin).mockResolvedValue({ id: 1, isAdmin: true })
})

describe('PUT /api/dict-items/[id]', () => {
  it('合法 → 200，含可选 sort/enabled', async () => {
    mock(prisma.dictItem.update).mockResolvedValue({ id: 1 })
    const res = await put({ label: '男', value: 'M', sort: 5, enabled: false })
    expect(res.status).toBe(200)
    const args = mock(prisma.dictItem.update).mock.calls[0][0]
    expect(args.where).toEqual({ id: 1 })
    expect(args.data).toMatchObject({ label: '男', value: 'M', sort: 5, enabled: false })
  })

  it('省略 sort/enabled 时不写入这两个字段', async () => {
    mock(prisma.dictItem.update).mockResolvedValue({ id: 1 })
    await put({ label: '男', value: 'M' })
    const data = mock(prisma.dictItem.update).mock.calls[0][0].data
    expect(data).toEqual({ label: '男', value: 'M' })
  })

  it('非法 ID → 400', async () => {
    const res = await put({ label: '男', value: 'M' }, 'x')
    expect(res.status).toBe(400)
    expect(prisma.dictItem.update).not.toHaveBeenCalled()
  })

  it('label 为空 → 400', async () => {
    const res = await put({ label: '', value: 'M' })
    expect(res.status).toBe(400)
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await put({ label: '男', value: 'M' })
    expect(res.status).toBe(403)
    expect(prisma.dictItem.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/dict-items/[id]', () => {
  it('合法 → success', async () => {
    mock(prisma.dictItem.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE(new Request('http://t/api/dict-items/1'), ctx('1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('非法 ID → 400', async () => {
    const res = await DELETE(new Request('http://t/api/dict-items/0'), ctx('0'))
    expect(res.status).toBe(400)
    expect(prisma.dictItem.delete).not.toHaveBeenCalled()
  })

  it('非管理员 → 403', async () => {
    mock(requireAdmin).mockRejectedValue(new HttpError(403, 'x'))
    const res = await DELETE(new Request('http://t/api/dict-items/1'), ctx('1'))
    expect(res.status).toBe(403)
    expect(prisma.dictItem.delete).not.toHaveBeenCalled()
  })
})
