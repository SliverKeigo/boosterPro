import { describe, it, expect } from 'vitest'
import { buildRequirementData, REQUIREMENT_INCLUDE } from '@/lib/requirementData'

describe('requirementData - INCLUDE 常量', () => {
  it('REQUIREMENT_INCLUDE 为对象且含关联与子表', () => {
    expect(typeof REQUIREMENT_INCLUDE).toBe('object')
    expect(REQUIREMENT_INCLUDE.customer).toBeDefined()
    expect(REQUIREMENT_INCLUDE.positionProfiles).toBe(true)
    expect(REQUIREMENT_INCLUDE.urgentRecords).toBe(true)
  })
})

describe('buildRequirementData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段与脏字段', () => {
    const out = buildRequirementData(
      {
        positionName: '后端工程师',
        recruiter: '招聘者',
        baseCity: '杭州',
        status: 'OPEN',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        customer: {},
        candidates: [],
        _count: {},
        junk: 1,
      },
      'create',
    )
    expect(out.positionName).toBe('后端工程师')
    expect(out.recruiter).toBe('招聘者')
    expect(out.baseCity).toBe('杭州')
    expect(out.status).toBe('OPEN')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('customer')
    expect(out).not.toHaveProperty('candidates')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildRequirementData({ positionName: 'A', createdById: 6 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('日期字段：字符串 → Date，空值 → null', () => {
    const out = buildRequirementData(
      { positionName: 'A', deadline: '2024-12-31', /* followDate 缺失 */ },
      'create',
    )
    expect(out.deadline).toBeInstanceOf(Date)
    expect(out.followDate).toBeNull()
  })

  it('数值 / 外键字段：空串与缺失 → null，数字字符串 → Number', () => {
    const out = buildRequirementData(
      {
        positionName: 'A',
        customerId: '3',
        headcount: '2',
        monthlySalaryMin: '15000',
        monthlySalaryMax: '',
        annualSalaryMin: 200000,
        ageMin: '25',
        // annualSalaryMax / ageMax 缺失
      },
      'create',
    )
    expect(out.customerId).toBe(3)
    expect(out.headcount).toBe(2)
    expect(out.monthlySalaryMin).toBe(15000)
    expect(out.monthlySalaryMax).toBeNull()
    expect(out.annualSalaryMin).toBe(200000)
    expect(out.ageMin).toBe(25)
    expect(out.annualSalaryMax).toBeNull()
    expect(out.ageMax).toBeNull()
  })

  it('genderRequirement 枚举空串 → null，有值原样保留', () => {
    expect(
      buildRequirementData({ positionName: 'A', genderRequirement: '' }, 'create')
        .genderRequirement,
    ).toBeNull()
    expect(
      buildRequirementData({ positionName: 'A', genderRequirement: 'MALE' }, 'create')
        .genderRequirement,
    ).toBe('MALE')
  })

  it('create：positionProfiles / urgentRecords 过滤空记录并转换', () => {
    const out = buildRequirementData(
      {
        positionName: 'A',
        positionProfiles: [
          { knowledgeCategory: '技术', knowledgeAmount: '5' },
          { knowledgeCategory: '', knowledgeAmount: '' }, // 过滤
        ],
        urgentRecords: [
          { memberId: '9', date: '2024-07-01' },
          { memberId: '', date: '' }, // 过滤
          { date: '2024-08-01' }, // memberId 缺失 → null
        ],
      },
      'create',
    )
    expect(out.positionProfiles.create).toEqual([
      { knowledgeCategory: '技术', knowledgeAmount: '5' },
    ])
    expect(out.urgentRecords.create).toHaveLength(2)
    expect(out.urgentRecords.create[0].memberId).toBe(9)
    expect(out.urgentRecords.create[0].date).toBeInstanceOf(Date)
    expect(out.urgentRecords.create[1].memberId).toBeNull()
    expect(out.urgentRecords.create[1].date).toBeInstanceOf(Date)
  })

  it('update：子表先 deleteMany 再 create', () => {
    const out = buildRequirementData(
      {
        positionName: 'A',
        positionProfiles: [{ knowledgeCategory: 'x' }],
        urgentRecords: [],
      },
      'update',
    )
    expect(out.positionProfiles.deleteMany).toEqual({})
    expect(out.positionProfiles.create).toHaveLength(1)
    expect(out.urgentRecords).toEqual({ deleteMany: {}, create: [] })
  })
})
