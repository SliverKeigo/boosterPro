import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/importServer', () => ({ parseWorkbook: vi.fn() }))
vi.mock('@/lib/importConfigs', () => ({ resolveCustomer: vi.fn(), resolveRequirement: vi.fn() }))
vi.mock('@/lib/groups', () => ({ assertCanWriteWorkPlan: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    group: { findFirst: vi.fn() },
    workPlan: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    workPlanItem: { deleteMany: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})

import { parseWorkbook } from '@/lib/importServer'
import { resolveCustomer, resolveRequirement } from '@/lib/importConfigs'
import { assertCanWriteWorkPlan } from '@/lib/groups'
import { prisma } from '@/lib/prisma'
import { runWorkPlanImport } from '@/lib/workPlanImport'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const user = { id: 7, isAdmin: false } as any
const run = () => runWorkPlanImport(new ArrayBuffer(0), user)

beforeEach(() => {
  vi.clearAllMocks()
  mock(assertCanWriteWorkPlan).mockResolvedValue(undefined)
  mock(resolveCustomer).mockResolvedValue(30)
  mock(resolveRequirement).mockResolvedValue(40)
  mock(prisma.group.findFirst).mockResolvedValue({ id: 2, members: [{ id: 6, name: '张伟' }, { id: 7, name: '李娜' }] })
})

describe('runWorkPlanImport', () => {
  it('多行同组+周 → 聚合为一个新周计划；组员名解析；参与度自动算', async () => {
    mock(parseWorkbook).mockResolvedValue([
      { __row: 2, 组: '交付一组', 周开始: '2026-06-01', 周结束: '2026-06-07', 交付策略: '第一梯队', 客户名称: '华成', 岗位名称: '财务主管', 是否例行寻猎: '是', 组员分配: '张伟=6.2' },
      { __row: 3, 组: '交付一组', 周开始: '2026-06-01', 周结束: '2026-06-07', 客户名称: '科创', 岗位名称: 'DSP', 组员分配: '张伟=6.4\n李娜=6.1、6.3' },
    ])
    mock(prisma.workPlan.create).mockResolvedValue({ id: 10 })
    const res = await run()
    expect(res).toMatchObject({ created: 1, failed: 0 })
    const data = mock(prisma.workPlan.create).mock.calls[0][0].data
    expect(data.groupId).toBe(2)
    expect(data.createdById).toBe(7)
    expect(data.items.create).toHaveLength(2)
    expect(data.items.create[0].assignments.create).toEqual([{ memberId: 6, planDates: '6.2' }])
    expect(data.items.create[0].participation).toBe(1) // 自动算
    expect(data.items.create[0].routineHunting).toBe(true)
    expect(data.items.create[1].assignments.create).toHaveLength(2) // 张伟 + 李娜
  })

  it('组员名不在组里 → 该计划报错、不写', async () => {
    mock(parseWorkbook).mockResolvedValue([{ __row: 2, 组: '交付一组', 周开始: '2026-06-01', 周结束: '2026-06-07', 岗位名称: 'X', 组员分配: '王五=6.1' }])
    const res = await run()
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('王五')
    expect(prisma.workPlan.create).not.toHaveBeenCalled()
  })

  it('有周计划id → 更新（deleteMany 旧明细 + update）', async () => {
    mock(parseWorkbook).mockResolvedValue([{ __row: 2, 周计划id: '5', 组: '交付一组', 周开始: '2026-06-01', 周结束: '2026-06-07', 岗位名称: 'X', 组员分配: '张伟=6.2' }])
    mock(prisma.workPlan.findUnique).mockResolvedValue({ id: 5 })
    mock(prisma.workPlan.update).mockResolvedValue({ id: 5 })
    const res = await run()
    expect(res).toMatchObject({ updated: 1, created: 0, failed: 0 })
    expect(prisma.workPlanItem.deleteMany).toHaveBeenCalledWith({ where: { workPlanId: 5 } })
  })

  it('组不存在 → 报错', async () => {
    mock(prisma.group.findFirst).mockResolvedValue(null)
    mock(parseWorkbook).mockResolvedValue([{ __row: 2, 组: '不存在组', 周开始: '2026-06-01', 周结束: '2026-06-07', 岗位名称: 'X' }])
    const res = await run()
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('不存在组')
  })
})
