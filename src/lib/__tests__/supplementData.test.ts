import { describe, it, expect } from 'vitest'
import { buildSupplementData, SUPPLEMENT_INCLUDE } from '@/lib/supplementData'

describe('supplementData - INCLUDE 常量', () => {
  it('SUPPLEMENT_INCLUDE 为对象且含关联与两个子表', () => {
    expect(typeof SUPPLEMENT_INCLUDE).toBe('object')
    expect(SUPPLEMENT_INCLUDE.customer).toBeDefined()
    expect(SUPPLEMENT_INCLUDE.demandUpdates).toBe(true)
    expect(SUPPLEMENT_INCLUDE.customerProfiles).toBe(true)
  })
})

describe('buildSupplementData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段与脏字段', () => {
    const out = buildSupplementData(
      {
        demandCustomer: '某客户',
        openingSpeech: '开场白',
        notes: '备注',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        customer: {},
        _count: {},
        junk: 1,
      },
      'create',
    )
    expect(out.demandCustomer).toBe('某客户')
    expect(out.openingSpeech).toBe('开场白')
    expect(out.notes).toBe('备注')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('customer')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildSupplementData({ demandCustomer: 'A', createdById: 4 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('customerId：数字字符串 → Number；空串 / 缺失 → null', () => {
    expect(buildSupplementData({ customerId: '11' }, 'create').customerId).toBe(11)
    expect(buildSupplementData({ customerId: '' }, 'create').customerId).toBeNull()
    expect(buildSupplementData({}, 'create').customerId).toBeNull()
  })

  it('create：demandUpdates / customerProfiles 过滤空记录并转换', () => {
    const out = buildSupplementData(
      {
        customerId: '1',
        demandUpdates: [
          { date: '2024-05-01', content: '更新1' },
          { date: '', content: '' }, // 过滤
        ],
        customerProfiles: [
          { specialty: '技术', description: '描述', attachmentUrl: '/api/files/p.pdf' },
          { specialty: '', description: '' }, // 过滤
          { specialty: '只有专长' }, // description → null
        ],
      },
      'create',
    )
    expect(out.demandUpdates.create).toHaveLength(1)
    expect(out.demandUpdates.create[0].date).toBeInstanceOf(Date)
    expect(out.demandUpdates.create[0].content).toBe('更新1')
    expect(out.customerProfiles.create).toHaveLength(2)
    expect(out.customerProfiles.create[0].attachmentUrl).toBe('/api/files/p.pdf')
    expect(out.customerProfiles.create[1]).toEqual({ specialty: '只有专长', description: null, attachmentUrl: null })
  })

  it('update：两个子表均先 deleteMany 再 create', () => {
    const out = buildSupplementData(
      {
        customerId: '1',
        demandUpdates: [{ content: 'x' }],
        customerProfiles: [],
      },
      'update',
    )
    expect(out.demandUpdates.deleteMany).toEqual({})
    expect(out.demandUpdates.create).toHaveLength(1)
    expect(out.customerProfiles).toEqual({ deleteMany: {}, create: [] })
  })
})
