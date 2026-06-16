import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma —— 导出端(runExport)读、导入端(runFengcunImport)写都走它。
// vi.hoisted：mockPrisma 与 vi.mock 一起提升到顶部，避免「在初始化前访问」。
const mockPrisma: any = vi.hoisted(() => ({
  clientSupplement: { findMany: vi.fn(), findFirst: vi.fn() },
  candidate: { findMany: vi.fn(), findFirst: vi.fn() },
  requirement: { findFirst: vi.fn() },
  customer: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { runExport } from '@/lib/jodooExport'
import { runFengcunImport } from '@/lib/jodooImport'
import { JODOO_MODULES } from '@/lib/jodooConfigs'

const asBuf = (buf: Buffer): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
const user = { id: 1, name: 'admin', isAdmin: true } as any

beforeEach(() => { vi.clearAllMocks() })

describe('封存包 导出→导入 闭环（子表多行展开）', () => {
  it('客户补充：双子表(3 需求更新 + 1 画像)导出多行展开 → 导入归并回原条数与内容', async () => {
    const createdAt = new Date('2026-06-01T10:00:00+08:00')
    mockPrisma.clientSupplement.findMany.mockResolvedValue([{
      id: 1, customerId: 10, demandCustomer: '需求方A', openingSpeech: '话术X', notes: null,
      createdAt, attachmentUrl: [],
      customer: { fullName: '客户全称A' },
      createdBy: { name: '张三' },
      demandUpdates: [
        { content: '更新内容1', date: new Date('2026-05-01T00:00:00+08:00') },
        { content: '更新内容2', date: new Date('2026-05-02T00:00:00+08:00') },
        { content: '更新内容3', date: new Date('2026-05-03T00:00:00+08:00') },
      ],
      customerProfiles: [
        { specialty: '专长1', description: '描述1', attachmentUrl: [] },
      ],
    }])

    const { buffer } = await runExport('CLIENT_SUPPLEMENT')
    expect(buffer.length).toBeGreaterThan(0)

    // 导入端 mock：客户存在、提交人存在、无重复→新增、捕获 create data
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 10 })
    let created: any = null
    const tx: any = {
      clientSupplement: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: any) => { created = data; return Promise.resolve({ id: 100 }) }),
        update: vi.fn(),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 5 }), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 6 }) },
      $executeRawUnsafe: vi.fn(),
    }
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))

    const result = await runFengcunImport(JODOO_MODULES.CLIENT_SUPPLEMENT!, asBuf(buffer), user)

    expect(result.failed).toBe(0)
    expect(result.created).toBe(1)
    // 闭环关键：子表条数往返一致（不再是「只导一条」）
    expect(created.demandUpdates.create).toHaveLength(3)
    expect(created.customerProfiles.create).toHaveLength(1)
    expect(created.demandUpdates.create.map((d: any) => d.content)).toEqual(['更新内容1', '更新内容2', '更新内容3'])
    expect(created.customerProfiles.create[0].specialty).toBe('专长1')
    // 主表标量从 lead 行取（纵向合并回读一致）
    expect(created.demandCustomer).toBe('需求方A')
    expect(created.customerId).toBe(10)
  })

  it('候选人：风险管理子表 riskDescription 经「风险识别」列往返一致 + 多条保证期沟通', async () => {
    const createdAt = new Date('2026-06-02T09:00:00+08:00')
    mockPrisma.candidate.findMany.mockResolvedValue([{
      id: 2, name: '李四', customerShortName: '简称B', createdAt,
      recommendationStatus: 'PENDING', education: 'BACHELOR', schoolTier: [], tags: [],
      offerFileUrl: [], backgroundCheckReportUrl: [],
      customer: undefined, requirement: { positionName: '岗位P' },
      createdBy: { name: '王五' },
      guaranteeCommunications: [
        { date: new Date('2026-05-10T00:00:00+08:00'), content: '沟通A' },
        { date: new Date('2026-05-11T00:00:00+08:00'), content: '沟通B' },
      ],
      riskEvents: [
        { date: new Date('2026-05-12T00:00:00+08:00'), riskDescription: '识别X / 应对Y' },
      ],
    }])

    const { buffer } = await runExport('CANDIDATE')

    mockPrisma.customer.findFirst.mockResolvedValue({ id: 20 })       // findCustomerId(简称B)
    mockPrisma.requirement.findFirst.mockResolvedValue({ id: 30 })    // 岗位P
    let created: any = null
    const tx: any = {
      candidate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: any) => { created = data; return Promise.resolve({ id: 200 }) }),
        update: vi.fn(),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 7 }), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 8 }) },
      $executeRawUnsafe: vi.fn(),
    }
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))

    const result = await runFengcunImport(JODOO_MODULES.CANDIDATE!, asBuf(buffer), user)

    expect(result.failed).toBe(0)
    expect(result.created).toBe(1)
    expect(created.guaranteeCommunications.create).toHaveLength(2)
    expect(created.riskEvents.create).toHaveLength(1)
    // riskDescription 整段从「风险识别」列往返还原
    expect(created.riskEvents.create[0].riskDescription).toBe('识别X / 应对Y')
    expect(created.guaranteeCommunications.create.map((g: any) => g.content)).toEqual(['沟通A', '沟通B'])
  })

  it('客户基本信息：办公地址单列多值(换行)往返 + 无横向子表', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{
      id: 3, fullName: '客户全称C', shortName: '简称C', region: '华东', detailedAddress: '某路1号',
      industry: '互联网', createdAt: new Date('2026-06-03T08:00:00+08:00'), attachmentUrl: [],
      createdBy: { name: '赵六' },
      officeAddresses: [{ address: '地址甲' }, { address: '地址乙' }],
    }])

    const { buffer } = await runExport('CUSTOMER')

    let created: any = null
    const tx: any = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: any) => { created = data; return Promise.resolve({ id: 300 }) }),
        update: vi.fn(),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 9 }), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 10 }) },
      $executeRawUnsafe: vi.fn(),
    }
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))

    const result = await runFengcunImport(JODOO_MODULES.CUSTOMER!, asBuf(buffer), user)

    expect(result.failed).toBe(0)
    expect(result.created).toBe(1)
    // 办公地址：导出单列换行 → 导入 splitSubtables 拆回 2 条
    expect(created.officeAddresses.create).toHaveLength(2)
    expect(created.officeAddresses.create.map((o: any) => o.address)).toEqual(['地址甲', '地址乙'])
  })
})
