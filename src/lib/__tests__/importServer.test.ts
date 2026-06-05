import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    talentPool: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    candidate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() }, // resolveCustomer
    requirement: { findMany: vi.fn() }, // resolveRequirement
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({ assertRowWritable: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { assertRowWritable } from '@/lib/permissions'
import { importRows } from '@/lib/importServer'
import { CONFIGS } from '@/lib/importConfigs'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const user = { id: 7, isAdmin: false } as any
const TP = CONFIGS.TALENT_POOL
const run = (rows: any[]) => importRows(TP, rows, user)

beforeEach(() => vi.clearAllMocks())

describe('importRows —— 人才储备库', () => {
  it('无 id → 新增：性别男→MALE、标签拆数组、写 createdById', async () => {
    mock(prisma.talentPool.create).mockResolvedValue({ id: 1 })
    const res = await run([{ __row: 2, 姓名: '张三', 性别: '男', 当前职位: '工程师', 人才标签: 'Go、云原生' }])
    expect(res).toEqual({ created: 1, updated: 0, failed: 0, errors: [] })
    const data = mock(prisma.talentPool.create).mock.calls[0][0].data
    expect(data).toMatchObject({ name: '张三', gender: 'MALE', currentPosition: '工程师', tags: ['Go', '云原生'], createdById: 7 })
  })

  it('有 id → 更新：findUnique + assertRowWritable + update', async () => {
    mock(prisma.talentPool.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.talentPool.update).mockResolvedValue({ id: 5 })
    const res = await run([{ __row: 2, id: 5, 姓名: '李四', 当前职位: 'PM' }])
    expect(res).toMatchObject({ created: 0, updated: 1, failed: 0 })
    expect(assertRowWritable).toHaveBeenCalled()
    expect(mock(prisma.talentPool.update).mock.calls[0][0].where).toEqual({ id: 5 })
  })

  it('缺必填（姓名空）→ 整批不写', async () => {
    const res = await run([{ __row: 2, 姓名: '', 当前职位: 'X' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0]).toMatchObject({ row: 2 })
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('性别无法识别 → 该行报错、整批不写', async () => {
    const res = await run([{ __row: 3, 姓名: '王五', 性别: '外星人', 当前职位: 'X' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('性别')
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('一对一错 → 整文件事务全不写（含正确行）', async () => {
    const res = await run([
      { __row: 2, 姓名: '对的', 当前职位: 'A' },
      { __row: 3, 姓名: '', 当前职位: 'B' }, // 错
    ])
    expect(res.failed).toBe(1)
    expect(res.created).toBe(0)
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('id 不存在 → 报错，不更新', async () => {
    mock(prisma.talentPool.findUnique).mockResolvedValue(null)
    const res = await run([{ __row: 2, id: 999, 姓名: 'X', 当前职位: 'Y' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('999')
    expect(prisma.talentPool.update).not.toHaveBeenCalled()
  })
})

describe('importRows —— 候选人（关系 + 子表 + 枚举反查）', () => {
  const CAND = CONFIGS.CANDIDATE
  const runC = (rows: any[]) => importRows(CAND, rows, user)

  it('客户名称→customerId、教育/状态枚举反查、子表 JSON 解析为 nested create', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 30 }])
    mock(prisma.requirement.findMany).mockResolvedValue([{ id: 40 }])
    mock(prisma.candidate.create).mockResolvedValue({ id: 1 })
    const res = await runC([{
      __row: 2, 姓名: '赵六', 招聘渠道: '猎聘', 推荐状态: '面试中', 教育经历: '本科',
      客户名称: '华成电力', 岗位名称: '财务主管',
      '保证期沟通记录(JSON)': '[{"date":"2026-01-01","content":"已沟通"}]',
    }])
    expect(res).toMatchObject({ created: 1, failed: 0 })
    const data = mock(prisma.candidate.create).mock.calls[0][0].data
    expect(data).toMatchObject({ name: '赵六', customerId: 30, requirementId: 40, recommendationStatus: 'INTERVIEWING', education: 'BACHELOR', createdById: 7 })
    expect(data.guaranteeCommunications.create[0]).toMatchObject({ content: '已沟通' })
    expect(data.guaranteeCommunications.create[0].date).toBeInstanceOf(Date)
  })

  it('关系名称查无 → 该行报错', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([])
    const res = await runC([{ __row: 2, 姓名: 'X', 招聘渠道: '猎聘', 推荐状态: '面试中', 客户名称: '不存在的客户' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('客户名称')
    expect(prisma.candidate.create).not.toHaveBeenCalled()
  })

  it('关系名称重名 → 该行报错', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await runC([{ __row: 2, 姓名: 'X', 招聘渠道: '猎聘', 推荐状态: '面试中', 客户名称: '腾讯' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('重名')
  })

  it('子表 JSON 非法 → 该行报错', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 30 }])
    mock(prisma.requirement.findMany).mockResolvedValue([{ id: 40 }])
    const res = await runC([{ __row: 2, 姓名: 'X', 招聘渠道: '猎聘', 推荐状态: '面试中', '保证期沟通记录(JSON)': '不是JSON' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('JSON')
  })
})
