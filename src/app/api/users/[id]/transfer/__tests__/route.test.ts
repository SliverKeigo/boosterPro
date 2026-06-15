import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

// 交互式事务：$transaction 把回调以 prisma 自身当 tx 调用（mock 的 tx 模型即这些 prisma 模型）。
vi.mock('@/lib/prisma', () => {
  const p: any = {
    user: { findUnique: vi.fn() },
    candidate: { updateMany: vi.fn() },
    requirement: { updateMany: vi.fn() },
    clientSupplement: { updateMany: vi.fn() },
    customerContact: { updateMany: vi.fn() },
    talentPool: { updateMany: vi.fn() },
    opportunity: { updateMany: vi.fn() },
    customer: { updateMany: vi.fn() },
    contract: { updateMany: vi.fn() },
    knowledgeBase: { updateMany: vi.fn() },
    transferLog: { create: vi.fn() }, // 移交审计日志
  }
  p.$transaction = vi.fn(async (cb: any) => cb(p))
  return { prisma: p }
})
vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { POST } from '@/app/api/users/[id]/transfer/route'

const admin = { id: 1, name: 'A', email: null, isAdmin: true, departmentId: null, roleId: null }
const normal = { id: 2, name: 'B', email: null, isAdmin: false, departmentId: 9, roleId: 5 }
const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (id = '5') => ({ params: Promise.resolve({ id }) })
const makeReq = (body: unknown) =>
  new Request('http://t', { method: 'POST', body: JSON.stringify(body) })

// 让九个业务表的 updateMany 都返回一个 count，便于断言聚合结果
const setupModels = () => {
  mock(prisma.candidate.updateMany).mockResolvedValue({ count: 1 })
  mock(prisma.requirement.updateMany).mockResolvedValue({ count: 2 })
  mock(prisma.clientSupplement.updateMany).mockResolvedValue({ count: 3 })
  mock(prisma.customerContact.updateMany).mockResolvedValue({ count: 9 })
  mock(prisma.talentPool.updateMany).mockResolvedValue({ count: 4 })
  mock(prisma.opportunity.updateMany).mockResolvedValue({ count: 5 })
  mock(prisma.customer.updateMany).mockResolvedValue({ count: 6 })
  mock(prisma.contract.updateMany).mockResolvedValue({ count: 7 })
  mock(prisma.knowledgeBase.updateMany).mockResolvedValue({ count: 8 })
  mock(prisma.transferLog.create).mockResolvedValue({ id: 1 })
}

beforeEach(() => {
  vi.clearAllMocks()
  mock(getCurrentUser).mockResolvedValue(admin)
})

describe('POST /api/users/[id]/transfer', () => {
  it('管理员移交：九张业务表 updateMany 均把 fromId 的数据改为 toId，并经 $transaction 提交', async () => {
    mock(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 9, name: '李四' }) // targetUser (toId)
      .mockResolvedValueOnce({ id: 5, name: '张三' }) // fromUser (fromId)
    setupModels()
    const res = await POST(makeReq({ toUserId: 9 }), ctx('5'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      moved: {
        candidate: 1,
        requirement: 2,
        clientSupplement: 3,
        customerContact: 9,
        talentPool: 4,
        opportunity: 5,
        customer: 6,
        contract: 7,
        knowledgeBase: 8,
      },
    })
    // 在一个事务中提交
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    // 同事务写一条审计日志：用户名快照 + 总条数(= 各表之和 1+2+3+9+4+5+6+7+8 = 45)
    expect(prisma.transferLog.create).toHaveBeenCalledTimes(1)
    expect(mock(prisma.transferLog.create).mock.calls[0][0].data).toMatchObject({
      fromUserId: 5, fromUserName: '张三', toUserId: 9, toUserName: '李四',
      operatorId: 1, operatorName: 'A', totalCount: 45,
    })
    // 每张表都用 from→to 的归属改写
    const expectArgs = { where: { createdById: 5 }, data: { createdById: 9 } }
    expect(mock(prisma.candidate.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.requirement.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.clientSupplement.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.customerContact.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.talentPool.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.opportunity.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.customer.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.contract.updateMany).mock.calls[0][0]).toEqual(expectArgs)
    expect(mock(prisma.knowledgeBase.updateMany).mock.calls[0][0]).toEqual(expectArgs)
  })

  it('非管理员 → 403（关键安全断言），不触发任何写入', async () => {
    mock(getCurrentUser).mockResolvedValue(normal)
    const res = await POST(makeReq({ toUserId: 9 }), ctx('5'))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.candidate.updateMany).not.toHaveBeenCalled()
  })

  it('未登录 → 403（route 对 null 与非 admin 同样抛 403）', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await POST(makeReq({ toUserId: 9 }), ctx('5'))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('非法源用户 ID → 400', async () => {
    const res = await POST(makeReq({ toUserId: 9 }), ctx('abc'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('缺少 toUserId → 400', async () => {
    const res = await POST(makeReq({}), ctx('5'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('源用户与目标用户相同 → 400', async () => {
    const res = await POST(makeReq({ toUserId: 5 }), ctx('5'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('目标用户不存在 → 400', async () => {
    mock(prisma.user.findUnique).mockResolvedValueOnce(null) // targetUser 不存在
    const res = await POST(makeReq({ toUserId: 9 }), ctx('5'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('源用户不存在 → 400', async () => {
    mock(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 9 }) // targetUser 存在
      .mockResolvedValueOnce(null) // fromUser 不存在
    const res = await POST(makeReq({ toUserId: 9 }), ctx('5'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
