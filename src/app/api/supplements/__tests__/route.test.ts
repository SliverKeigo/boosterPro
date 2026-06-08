import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientSupplement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(),
  requireAdmin: vi.fn(),
  assertRowWritable: vi.fn(),
  buildRowFilter: vi.fn(),
  assertRowAccess: vi.fn(),
}))
// 解耦数据构造器：路由只负责编排与归属，构造逻辑在 supplementData 自己的单测里覆盖。
vi.mock('@/lib/supplementData', () => ({
  SUPPLEMENT_INCLUDE: {},
  buildSupplementData: vi.fn(() => ({})),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission, buildRowFilter, assertRowAccess } from '@/lib/permissions'
import { GET, POST } from '@/app/api/supplements/route'
import {
  GET as GET_ID,
  PUT as PUT_ID,
  DELETE as DELETE_ID,
} from '@/app/api/supplements/[id]/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(user)
  mock(buildRowFilter).mockResolvedValue({})
  mock(assertRowAccess).mockResolvedValue(undefined)
})

describe('GET /api/supplements', () => {
  it('校验 CLIENT_SUPPLEMENT VIEW 并返回 {data,total}', async () => {
    mock(prisma.clientSupplement.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requirePermission).toHaveBeenCalledWith('CLIENT_SUPPLEMENT', 'VIEW')
    expect(prisma.clientSupplement.findMany).toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('无 VIEW 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('POST /api/supplements', () => {
  it('校验 CREATE，写入 createdById，返回 201', async () => {
    mock(prisma.clientSupplement.create).mockResolvedValue({ id: 10 })
    const req = new Request('http://t/api/supplements', {
      method: 'POST',
      body: JSON.stringify({ company: '甲方' }),
    })
    const res = await POST(req)
    expect(requirePermission).toHaveBeenCalledWith('CLIENT_SUPPLEMENT', 'CREATE')
    const args = mock(prisma.clientSupplement.create).mock.calls[0][0]
    expect(args.data.createdById).toBe(7)
    expect(res.status).toBe(201)
  })

  it('无 CREATE 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/supplements', { method: 'POST', body: '{}' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/supplements/[id]', () => {
  it('校验 VIEW 并返回单条', async () => {
    mock(prisma.clientSupplement.findUnique).mockResolvedValue({ id: 1 })
    const res = await GET_ID(new Request('http://t/api/supplements/1'), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(requirePermission).toHaveBeenCalledWith('CLIENT_SUPPLEMENT', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 1 })
  })

  it('记录不存在 → 404', async () => {
    mock(assertRowAccess).mockRejectedValue(new HttpError(404, '不存在'))
    mock(prisma.clientSupplement.findUnique).mockResolvedValue(null)
    const res = await GET_ID(new Request('http://t/api/supplements/1'), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(res.status).toBe(404)
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET_ID(new Request('http://t/api/supplements/1'), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/supplements/[id]', () => {
  it('校验 EDIT、行级归属后更新', async () => {
    mock(prisma.clientSupplement.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.clientSupplement.update).mockResolvedValue({ id: 1 })
    const req = new Request('http://t/api/supplements/1', {
      method: 'PUT',
      body: JSON.stringify({ company: '改' }),
    })
    const res = await PUT_ID(req, { params: Promise.resolve({ id: '1' }) })
    expect(requirePermission).toHaveBeenCalledWith('CLIENT_SUPPLEMENT', 'EDIT')
    expect(assertRowAccess).toHaveBeenCalledWith(user, { createdById: 7 }, 'CLIENT_SUPPLEMENT', 'write')
    expect(prisma.clientSupplement.update).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('非本人数据 → 403', async () => {
    mock(prisma.clientSupplement.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowAccess).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/supplements/1', { method: 'PUT', body: '{}' })
    const res = await PUT_ID(req, { params: Promise.resolve({ id: '1' }) })
    expect(prisma.clientSupplement.update).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })

  it('无 EDIT 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/supplements/1', { method: 'PUT', body: '{}' })
    const res = await PUT_ID(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/supplements/[id]', () => {
  it('校验 DELETE、行级归属后删除，返回 {success:true}', async () => {
    mock(prisma.clientSupplement.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.clientSupplement.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE_ID(new Request('http://t/api/supplements/1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(requirePermission).toHaveBeenCalledWith('CLIENT_SUPPLEMENT', 'DELETE')
    expect(assertRowAccess).toHaveBeenCalledWith(user, { createdById: 7 }, 'CLIENT_SUPPLEMENT', 'write')
    expect(prisma.clientSupplement.delete).toHaveBeenCalled()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('非本人数据 → 403', async () => {
    mock(prisma.clientSupplement.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowAccess).mockRejectedValue(new HttpError(403, '无权限'))
    const res = await DELETE_ID(new Request('http://t/api/supplements/1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(prisma.clientSupplement.delete).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })
})
