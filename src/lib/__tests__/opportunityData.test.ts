import { describe, it, expect } from 'vitest'
import { buildOpportunityData, OPPORTUNITY_INCLUDE } from '@/lib/opportunityData'

describe('opportunityData - INCLUDE 常量', () => {
  it('OPPORTUNITY_INCLUDE 为对象且含 salesOwner / progressRecords', () => {
    expect(typeof OPPORTUNITY_INCLUDE).toBe('object')
    expect(OPPORTUNITY_INCLUDE.salesOwner).toBeDefined()
    expect(OPPORTUNITY_INCLUDE.progressRecords).toBe(true)
  })
})

describe('buildOpportunityData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段与脏字段', () => {
    const out = buildOpportunityData(
      {
        name: '某商机',
        description: '描述',
        status: 'LEAD',
        nature: 'DIRECT',
        contactName: '张经理',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        salesOwner: {},
        _count: {},
        junk: 'drop',
      },
      'create',
    )
    expect(out.name).toBe('某商机')
    expect(out.description).toBe('描述')
    expect(out.status).toBe('LEAD')
    expect(out.nature).toBe('DIRECT')
    expect(out.contactName).toBe('张经理')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('salesOwner')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildOpportunityData({ name: 'A', createdById: 5 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('salesOwnerId：数字字符串 → Number', () => {
    expect(buildOpportunityData({ name: 'A', salesOwnerId: '8' }, 'create').salesOwnerId).toBe(8)
  })

  it('salesOwnerId：空串 → null', () => {
    expect(buildOpportunityData({ name: 'A', salesOwnerId: '' }, 'create').salesOwnerId).toBeNull()
  })

  it('salesOwnerId：缺失 → null', () => {
    expect(buildOpportunityData({ name: 'A' }, 'create').salesOwnerId).toBeNull()
  })

  it('create：progressRecords 过滤空记录，date → Date / null，description 空 → null', () => {
    const out = buildOpportunityData(
      {
        name: 'A',
        progressRecords: [
          { date: '2024-06-01', description: '进展1' },
          { date: '', description: '' }, // 过滤
          { description: '只有描述' }, // date → null
        ],
      },
      'create',
    )
    expect(out.progressRecords.create).toHaveLength(2)
    expect(out.progressRecords.create[0].date).toBeInstanceOf(Date)
    expect(out.progressRecords.create[0].description).toBe('进展1')
    expect(out.progressRecords.create[1]).toEqual({ date: null, description: '只有描述' })
  })

  it('update：progressRecords 先 deleteMany 再 create', () => {
    const out = buildOpportunityData(
      { name: 'A', progressRecords: [{ description: 'x' }] },
      'update',
    )
    expect(out.progressRecords.deleteMany).toEqual({})
    expect(out.progressRecords.create).toHaveLength(1)
  })
})
