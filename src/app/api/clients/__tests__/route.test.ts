import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: {
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
  assertRowWritable: vi.fn(),
  buildRowFilter: vi.fn(),
  assertRowAccess: vi.fn(),
}))
// 解耦数据构造器：路由只负责编排与归属，构造逻辑在 clientData 自己的单测里覆盖。
vi.mock('@/lib/clientData', () => ({
  CUSTOMER_INCLUDE: {},
  buildCustomerData: vi.fn(() => ({})),
  assertCustomerUnique: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission, buildRowFilter, assertRowAccess } from '@/lib/permissions'
import { GET, POST } from '@/app/api/clients/route'
import {
  GET as GET_ID,
  PUT as PUT_ID,
  DELETE as DELETE_ID,
} from '@/app/api/clients/[id]/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const params = { params: Promise.resolve({ id: '1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(user)
  mock(buildRowFilter).mockResolvedValue({})
  mock(assertRowAccess).mockResolvedValue(undefined)
})

describe('GET /api/clients', () => {
  it('校验 CUSTOMER VIEW 并返回 {data,total}', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requirePermission).toHaveBeenCalledWith('CUSTOMER', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/clients', () => {
  it('校验 CREATE，写入 createdById，返回 201', async () => {
    mock(prisma.customer.create).mockResolvedValue({ id: 10 })
    const req = new Request('http://t/api/clients', {
      method: 'POST',
      body: JSON.stringify({ shortName: 'ACME' }),
    })
    const res = await POST(req)
    expect(requirePermission).toHaveBeenCalledWith('CUSTOMER', 'CREATE')
    const args = mock(prisma.customer.create).mock.calls[0][0]
    expect(args.data.createdById).toBe(7)
    expect(res.status).toBe(201)
  })

  it('无 CREATE 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/clients', { method: 'POST', body: '{}' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/clients/[id]', () => {
  it('校验 VIEW 并返回单条', async () => {
    mock(prisma.customer.findUnique).mockResolvedValue({ id: 1, shortName: 'ACME' })
    const res = await GET_ID(new Request('http://t'), params)
    expect(requirePermission).toHaveBeenCalledWith('CUSTOMER', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 1, shortName: 'ACME' })
  })

  it('不存在 → 404', async () => {
    mock(assertRowAccess).mockRejectedValue(new HttpError(404, '不存在'))
    mock(prisma.customer.findUnique).mockResolvedValue(null)
    const res = await GET_ID(new Request('http://t'), params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/clients/[id]', () => {
  it('校验 EDIT + 行级归属，返回更新结果', async () => {
    mock(prisma.customer.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.customer.update).mockResolvedValue({ id: 1, shortName: 'NEW' })
    const req = new Request('http://t', { method: 'PUT', body: JSON.stringify({ shortName: 'NEW' }) })
    const res = await PUT_ID(req, params)
    expect(requirePermission).toHaveBeenCalledWith('CUSTOMER', 'EDIT')
    expect(assertRowAccess).toHaveBeenCalledWith(user, { createdById: 7 }, 'CUSTOMER', 'write')
    expect(res.status).toBe(200)
  })

  it('非本人创建 → 403', async () => {
    mock(prisma.customer.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowAccess).mockRejectedValue(new HttpError(403, '无权修改他人数据'))
    const req = new Request('http://t', { method: 'PUT', body: '{}' })
    const res = await PUT_ID(req, params)
    expect(res.status).toBe(403)
    expect(prisma.customer.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/clients/[id]', () => {
  it('校验 DELETE + 行级归属，返回 {success}', async () => {
    mock(prisma.customer.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.customer.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE_ID(new Request('http://t', { method: 'DELETE' }), params)
    expect(requirePermission).toHaveBeenCalledWith('CUSTOMER', 'DELETE')
    expect(assertRowAccess).toHaveBeenCalledWith(user, { createdById: 7 }, 'CUSTOMER', 'write')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('非本人创建 → 403', async () => {
    mock(prisma.customer.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowAccess).mockRejectedValue(new HttpError(403, '无权删除他人数据'))
    const res = await DELETE_ID(new Request('http://t', { method: 'DELETE' }), params)
    expect(res.status).toBe(403)
    expect(prisma.customer.delete).not.toHaveBeenCalled()
  })
})
