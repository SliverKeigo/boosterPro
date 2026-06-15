import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    talentPool: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    candidate: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() }, // resolveCustomer
    requirement: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }, // resolveRequirement + REQUIREMENT 导入
    opportunity: { create: vi.fn() }, // OPPORTUNITY 导入(omitIfEmpty)
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({ assertRowWritable: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { assertRowWritable } from '@/lib/permissions'
import { importRows, normHeader } from '@/lib/importServer'
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

  it('附件字段(urls 类型)：换行分隔的多 URL → 数组（保留 URL 内逗号/分号，不错拆）', async () => {
    mock(prisma.talentPool.create).mockResolvedValue({ id: 1 })
    await run([{ __row: 2, 姓名: '王五', 当前职位: 'X', 简历及相关资料: '/api/files/a,b.pdf\n/api/files/c;d.docx' }])
    const data = mock(prisma.talentPool.create).mock.calls[0][0].data
    expect(data.resumeUrl).toEqual(['/api/files/a,b.pdf', '/api/files/c;d.docx'])
  })

  it('附件字段(urls 类型)：空单元格 → 空数组(非 null，适配 NOT NULL text[])', async () => {
    mock(prisma.talentPool.create).mockResolvedValue({ id: 1 })
    await run([{ __row: 2, 姓名: '王五', 当前职位: 'X', 简历及相关资料: '' }])
    const data = mock(prisma.talentPool.create).mock.calls[0][0].data
    expect(data.resumeUrl).toEqual([])
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

  it('客户名称→customerId、教育/状态枚举反查、子表文本解析为 nested create', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 30 }])
    mock(prisma.requirement.findMany).mockResolvedValue([{ id: 40 }])
    mock(prisma.candidate.create).mockResolvedValue({ id: 1 })
    const res = await runC([{
      __row: 2, 姓名: '赵六', 招聘渠道: '猎聘', 推荐状态: '面试中', 教育经历: '本科',
      客户名称: '华成电力', 岗位名称: '财务主管',
      '保证期沟通记录（日期 | 内容）': '2026-01-01 | 已沟通',
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

  it('子表多行文本 → 解析为多条；最后一个字段吸收多余的 |', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 30 }])
    mock(prisma.requirement.findMany).mockResolvedValue([{ id: 40 }])
    mock(prisma.candidate.create).mockResolvedValue({ id: 1 })
    const res = await runC([{
      __row: 2, 姓名: 'X', 招聘渠道: '猎聘', 推荐状态: '面试中',
      '保证期沟通记录（日期 | 内容）': '2026-01-01 | 已沟通\n2026-02-01 | 又聊了 | 含竖线',
    }])
    expect(res).toMatchObject({ created: 1, failed: 0 })
    const rows = mock(prisma.candidate.create).mock.calls[0][0].data.guaranteeCommunications.create
    expect(rows).toHaveLength(2)
    expect(rows[1].content).toBe('又聊了 | 含竖线') // 最后字段吸收剩余的 |
  })
})

describe('importRows —— 客户需求（必填关系 + 多值状态）', () => {
  const REQ = CONFIGS.REQUIREMENT
  const runR = (rows: any[]) => importRows(REQ, rows, user)

  it('必填关系「客户名称」为空 → 报错，不创建', async () => {
    const res = await runR([{ __row: 2, 岗位名称: '后端', 招聘人数: '2', base城市: '深圳' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('客户名称')
    expect(prisma.requirement.create).not.toHaveBeenCalled()
  })

  it('合法 → 客户解析 + 岗位状态拆数组 + 性别要求枚举', async () => {
    mock(prisma.customer.findMany).mockResolvedValue([{ id: 30 }])
    mock(prisma.requirement.create).mockResolvedValue({ id: 1 })
    const res = await runR([{ __row: 2, 客户名称: '华成电力', 岗位名称: '后端', 招聘人数: '2', base城市: '深圳', 岗位状态: '新增、加急', 性别要求: '不限' }])
    expect(res).toMatchObject({ created: 1, failed: 0 })
    const data = mock(prisma.requirement.create).mock.calls[0][0].data
    expect(data).toMatchObject({ customerId: 30, positionName: '后端', headcount: 2, baseCity: '深圳', status: ['新增', '加急'], genderRequirement: 'ANY' })
  })
})

describe('importRows —— omitIfEmpty（NOT NULL + 默认值列）', () => {
  it('商机 状态/性质 留空 → 不写该字段（走 DB 默认）', async () => {
    mock(prisma.opportunity.create).mockResolvedValue({ id: 1 })
    const res = await importRows(CONFIGS.OPPORTUNITY, [{
      __row: 2, 商机名称: '某商机', 描述: 'd', 区域: '华南', 销售决策信息: 's', 客户决策人: 'c', 决策人描述: 'dm',
    }], user)
    expect(res).toMatchObject({ created: 1, failed: 0 })
    const data = mock(prisma.opportunity.create).mock.calls[0][0].data
    expect('status' in data).toBe(false) // 空 → 省略，用默认「线索阶段」
    expect('nature' in data).toBe(false) // 空 → 省略，用默认 DIRECT
    expect(data.name).toBe('某商机')
  })
})

describe('normHeader（去掉必填标记 *，使导出的 * 表头仍能匹配配置）', () => {
  it('去掉末尾的 * / ＊ / （必填）', () => {
    expect(normHeader('客户简称*')).toBe('客户简称')
    expect(normHeader('客户简称 ＊')).toBe('客户简称')
    expect(normHeader('客户简称（必填）')).toBe('客户简称')
    expect(normHeader('客户简称(必填)')).toBe('客户简称')
  })
  it('普通表头不变；中间的 * 不动', () => {
    expect(normHeader('客户简称')).toBe('客户简称')
    expect(normHeader('a*b')).toBe('a*b')
  })
})
