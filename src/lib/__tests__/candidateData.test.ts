import { describe, it, expect } from 'vitest'
import {
  buildCandidateData,
  CANDIDATE_INCLUDE,
  CANDIDATE_LIST_INCLUDE,
} from '@/lib/candidateData'

describe('candidateData - INCLUDE 常量', () => {
  it('LIST / 详情 INCLUDE 均为对象', () => {
    expect(typeof CANDIDATE_LIST_INCLUDE).toBe('object')
    expect(typeof CANDIDATE_INCLUDE).toBe('object')
  })
  it('LIST 与详情 INCLUDE 均含 customer 与子表（列表“显示列”的子表摘要列依赖其数据）', () => {
    const list = CANDIDATE_LIST_INCLUDE as Record<string, unknown>
    const detail = CANDIDATE_INCLUDE as Record<string, unknown>
    expect(list.customer).toBeDefined()
    expect(list.guaranteeCommunications).toBe(true)
    expect(list.riskEvents).toBe(true)
    expect(detail.customer).toBeDefined()
    expect(detail.guaranteeCommunications).toBe(true)
    expect(detail.riskEvents).toBe(true)
  })
})

describe('buildCandidateData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段', () => {
    const out = buildCandidateData(
      {
        name: '李四',
        phone: '13800000000',
        email: 'a@b.com',
        // 应被剔除
        id: 99,
        createdAt: '2020-01-01',
        updatedAt: '2020-01-02',
        customer: { id: 1 },
        requirement: { id: 2 },
        submitter: { id: 3 },
        _count: { x: 1 },
        // 不在白名单内的脏字段
        bogusField: 'should-be-dropped',
      },
      'create',
    )
    expect(out.name).toBe('李四')
    expect(out.phone).toBe('13800000000')
    expect(out.email).toBe('a@b.com')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('updatedAt')
    expect(out).not.toHaveProperty('customer')
    expect(out).not.toHaveProperty('requirement')
    expect(out).not.toHaveProperty('submitter')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('bogusField')
  })

  it('不设置 createdById（由 route 负责）', () => {
    const out = buildCandidateData({ name: '王五', createdById: 7 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('日期字符串 → Date，空值 → null', () => {
    const out = buildCandidateData(
      {
        offerDate: '2024-05-01',
        actualOnboardDate: '',
        recommendationTime: '2024-04-01T00:00:00.000Z',
        // guaranteePeriodEnd / offerOnboardDate 缺失
      },
      'create',
    )
    expect(out.offerDate).toBeInstanceOf(Date)
    expect((out.offerDate as Date).getUTCFullYear()).toBe(2024)
    expect(out.actualOnboardDate).toBeNull()
    expect(out.recommendationTime).toBeInstanceOf(Date)
    expect(out.guaranteePeriodEnd).toBeNull()
    expect(out.offerOnboardDate).toBeNull()
  })

  it('数值 / 外键字段：空串与缺失 → null，数字字符串 → Number', () => {
    const out = buildCandidateData(
      {
        customerId: '12',
        requirementId: '',
        submitterId: 5,
        birthYear: '1990-05',
        guaranteePeriodMonths: '3',
        // submitDepartmentId 缺失
      },
      'create',
    )
    expect(out.customerId).toBe(12)
    expect(out.requirementId).toBeNull()
    expect(out.submitterId).toBe(5)
    expect(out.birthYear).toBe('1990-05') // 出生年月为 YYYY-MM 文本，原样保留、不转数字
    expect(out.guaranteePeriodMonths).toBe(3)
    expect(out.submitDepartmentId).toBeNull()
  })

  it('枚举字段空串 → null', () => {
    const out = buildCandidateData({ education: '', schoolTier: 'T985_211' }, 'create')
    expect(out.education).toBeNull()
    expect(out.schoolTier).toBe('T985_211')
  })

  it('tags：非数组的真值包装为单元素数组，假值为空数组', () => {
    expect(buildCandidateData({ tags: 'VIP' }, 'create').tags).toEqual(['VIP'])
    expect(buildCandidateData({ tags: '' }, 'create').tags).toEqual([])
    expect(buildCandidateData({ tags: ['a', 'b'] }, 'create').tags).toEqual(['a', 'b'])
    expect(buildCandidateData({}, 'create').tags).toEqual([])
  })

  it('create：子表用 create 嵌套写，并过滤空记录', () => {
    const out = buildCandidateData(
      {
        guaranteeCommunications: [
          { date: '2024-01-01', content: '沟通1' },
          { date: '', content: '' }, // 应被过滤
        ],
        riskEvents: [{ date: '2024-02-01', riskDescription: '风险A' }],
      },
      'create',
    )
    expect(out.guaranteeCommunications).toEqual({
      create: [{ date: expect.any(Date), content: '沟通1' }],
    })
    expect(out.guaranteeCommunications.create).toHaveLength(1)
    expect(out.riskEvents.create[0].riskDescription).toBe('风险A')
    expect(out.riskEvents.create[0].date).toBeInstanceOf(Date)
  })

  it('update：子表先 deleteMany 再 create', () => {
    const out = buildCandidateData(
      {
        guaranteeCommunications: [{ date: '2024-01-01', content: 'x' }],
        riskEvents: [],
      },
      'update',
    )
    expect(out.guaranteeCommunications.deleteMany).toEqual({})
    expect(out.guaranteeCommunications.create).toHaveLength(1)
    expect(out.riskEvents).toEqual({ deleteMany: {}, create: [] })
  })

  it('子表记录内 content/riskDescription 空 → null', () => {
    const out = buildCandidateData(
      {
        guaranteeCommunications: [{ date: '2024-01-01', content: '' }],
        riskEvents: [{ riskDescription: '只填描述' }],
      },
      'create',
    )
    expect(out.guaranteeCommunications.create[0].content).toBeNull()
    expect(out.riskEvents.create[0].date).toBeNull()
  })
})
