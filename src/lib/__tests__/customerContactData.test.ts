import { describe, it, expect } from 'vitest'
import { buildCustomerContactData, CUSTOMER_CONTACT_INCLUDE } from '@/lib/customerContactData'

describe('customerContactData - INCLUDE 常量', () => {
  it('CUSTOMER_CONTACT_INCLUDE 为对象且含关联与 contacts 子表', () => {
    expect(typeof CUSTOMER_CONTACT_INCLUDE).toBe('object')
    expect(CUSTOMER_CONTACT_INCLUDE.customer).toBeDefined()
    expect(CUSTOMER_CONTACT_INCLUDE.submitter).toBeDefined()
    expect(CUSTOMER_CONTACT_INCLUDE.contacts).toBe(true)
  })
})

describe('buildCustomerContactData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段与脏字段', () => {
    const out = buildCustomerContactData(
      {
        title: '客户联系人维护',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        customer: {},
        submitter: {},
        _count: {},
        junk: 1,
      },
      'create',
    )
    expect(out.title).toBe('客户联系人维护')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('updatedAt')
    expect(out).not.toHaveProperty('customer')
    expect(out).not.toHaveProperty('submitter')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById（白名单外）', () => {
    const out = buildCustomerContactData({ title: 'A', createdById: 8 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('外键字段：数字字符串 → Number；空串 / 缺失 → null', () => {
    const out = buildCustomerContactData(
      {
        title: 'A',
        customerId: '3',
        submitterId: '',
        // submitDepartmentId 缺失
      },
      'create',
    )
    expect(out.customerId).toBe(3)
    expect(out.submitterId).toBeNull()
    expect(out.submitDepartmentId).toBeNull()
  })

  it('外键字段：数字原样、显式 null 保持 null', () => {
    const out = buildCustomerContactData(
      { title: 'A', customerId: 5, submitterId: null, submitDepartmentId: 2 },
      'create',
    )
    expect(out.customerId).toBe(5)
    expect(out.submitterId).toBeNull()
    expect(out.submitDepartmentId).toBe(2)
  })

  it('create：contacts 过滤全空记录、各字段空值归 null', () => {
    const out = buildCustomerContactData(
      {
        title: 'A',
        contacts: [
          {
            contactName: '王经理',
            contactTitle: '采购总监',
            contactPhone: '13800000000',
            contactEmail: 'wang@t.com',
            contactHobby: '高尔夫',
          },
          { contactName: '', contactTitle: '', contactPhone: '', contactEmail: '', contactHobby: '' }, // 过滤
          { contactName: '只有名字' }, // 其余字段 → null
        ],
      },
      'create',
    )
    expect(out.contacts.create).toHaveLength(2)
    expect(out.contacts.create[0]).toEqual({
      contactName: '王经理',
      contactTitle: '采购总监',
      contactPhone: '13800000000',
      contactEmail: 'wang@t.com',
      contactHobby: '高尔夫',
    })
    expect(out.contacts.create[1]).toEqual({
      contactName: '只有名字',
      contactTitle: null,
      contactPhone: null,
      contactEmail: null,
      contactHobby: null,
    })
    // create 模式不带 deleteMany
    expect(out.contacts).not.toHaveProperty('deleteMany')
  })

  it('create：contacts 缺失时默认空 create 数组', () => {
    const out = buildCustomerContactData({ title: 'A' }, 'create')
    expect(out.contacts).toEqual({ create: [] })
  })

  it('update：contacts 先 deleteMany 再 create', () => {
    const out = buildCustomerContactData(
      { title: 'A', contacts: [{ contactName: '王经理' }] },
      'update',
    )
    expect(out.contacts.deleteMany).toEqual({})
    expect(out.contacts.create).toHaveLength(1)
    expect(out.contacts.create[0].contactName).toBe('王经理')
  })

  it('update：contacts 为空数组仍为 { deleteMany, create:[] }', () => {
    const out = buildCustomerContactData({ title: 'A', contacts: [] }, 'update')
    expect(out.contacts).toEqual({ deleteMany: {}, create: [] })
  })
})
