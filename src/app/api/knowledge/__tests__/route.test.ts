import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeBase: {
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
}))
// 解耦数据构造器：路由只负责编排与归属，构造逻辑在 knowledgeData 自己的单测里覆盖。
vi.mock('@/lib/knowledgeData', () => ({
  KNOWLEDGE_INCLUDE: {},
  buildKnowledgeData: vi.fn(() => ({})),
}))

import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowWritable } from '@/lib/permissions'
import { GET, POST } from '@/app/api/knowledge/route'
import {
  GET as GET_ID,
  PUT as PUT_ID,
  DELETE as DELETE_ID,
} from '@/app/api/knowledge/[id]/route'

const user = { id: 7, isAdmin: false }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const params = { params: Promise.resolve({ id: '1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mock(requirePermission).mockResolvedValue(user)
  mock(assertRowWritable).mockReturnValue(undefined)
})

describe('GET /api/knowledge', () => {
  it('校验 KNOWLEDGE VIEW 并返回 {data,total}', async () => {
    mock(prisma.knowledgeBase.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await GET()
    expect(requirePermission).toHaveBeenCalledWith('KNOWLEDGE', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 })
  })

  it('未登录 → 401', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(401, '未登录'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/knowledge', () => {
  it('校验 CREATE，写入 createdById，返回 201', async () => {
    mock(prisma.knowledgeBase.create).mockResolvedValue({ id: 10 })
    const req = new Request('http://t/api/knowledge', {
      method: 'POST',
      body: JSON.stringify({ title: '知识A' }),
    })
    const res = await POST(req)
    expect(requirePermission).toHaveBeenCalledWith('KNOWLEDGE', 'CREATE')
    const args = mock(prisma.knowledgeBase.create).mock.calls[0][0]
    expect(args.data.createdById).toBe(7)
    expect(res.status).toBe(201)
  })

  it('无 CREATE 权限 → 403', async () => {
    mock(requirePermission).mockRejectedValue(new HttpError(403, '无权限'))
    const req = new Request('http://t/api/knowledge', { method: 'POST', body: '{}' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/knowledge/[id]', () => {
  it('校验 VIEW 并返回单条', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue({ id: 1, title: '知识A' })
    const res = await GET_ID(new Request('http://t'), params)
    expect(requirePermission).toHaveBeenCalledWith('KNOWLEDGE', 'VIEW')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 1, title: '知识A' })
  })

  it('不存在 → 404', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue(null)
    const res = await GET_ID(new Request('http://t'), params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/knowledge/[id]', () => {
  it('校验 EDIT + 行级归属，返回更新结果', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.knowledgeBase.update).mockResolvedValue({ id: 1, title: 'NEW' })
    const req = new Request('http://t', { method: 'PUT', body: JSON.stringify({ title: 'NEW' }) })
    const res = await PUT_ID(req, params)
    expect(requirePermission).toHaveBeenCalledWith('KNOWLEDGE', 'EDIT')
    expect(assertRowWritable).toHaveBeenCalledWith(user, { createdById: 7 })
    expect(res.status).toBe(200)
  })

  it('非本人创建 → 403', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowWritable).mockImplementation(() => {
      throw new HttpError(403, '无权修改他人数据')
    })
    const req = new Request('http://t', { method: 'PUT', body: '{}' })
    const res = await PUT_ID(req, params)
    expect(res.status).toBe(403)
    expect(prisma.knowledgeBase.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/knowledge/[id]', () => {
  it('校验 DELETE + 行级归属，返回 {success}', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.knowledgeBase.delete).mockResolvedValue({ id: 1 })
    const res = await DELETE_ID(new Request('http://t', { method: 'DELETE' }), params)
    expect(requirePermission).toHaveBeenCalledWith('KNOWLEDGE', 'DELETE')
    expect(assertRowWritable).toHaveBeenCalledWith(user, { createdById: 7 })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('非本人创建 → 403', async () => {
    mock(prisma.knowledgeBase.findUnique).mockResolvedValue({ createdById: 99 })
    mock(assertRowWritable).mockImplementation(() => {
      throw new HttpError(403, '无权删除他人数据')
    })
    const res = await DELETE_ID(new Request('http://t', { method: 'DELETE' }), params)
    expect(res.status).toBe(403)
    expect(prisma.knowledgeBase.delete).not.toHaveBeenCalled()
  })
})
