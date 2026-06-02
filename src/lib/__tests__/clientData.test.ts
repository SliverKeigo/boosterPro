import { describe, it, expect } from 'vitest'
import { buildCustomerData, CUSTOMER_INCLUDE } from '@/lib/clientData'

describe('clientData - INCLUDE 常量', () => {
  it('CUSTOMER_INCLUDE 为对象且含 officeAddresses', () => {
    expect(typeof CUSTOMER_INCLUDE).toBe('object')
    expect(CUSTOMER_INCLUDE.officeAddresses).toBe(true)
  })
})

describe('buildCustomerData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段与脏字段', () => {
    const out = buildCustomerData(
      {
        fullName: '某某科技有限公司',
        shortName: '某某',
        industry: '金融',
        region: '上海',
        locationLat: '31.2',
        locationLng: '121.4',
        // 应被剔除
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        supplements: [],
        requirements: [],
        candidates: [],
        contracts: [],
        _count: {},
        bogus: 'drop-me',
      },
      'create',
    )
    expect(out.fullName).toBe('某某科技有限公司')
    expect(out.shortName).toBe('某某')
    expect(out.industry).toBe('金融')
    expect(out.region).toBe('上海')
    // locationLat/Lng 在白名单内、原样保留（builder 不做数值转换）
    expect(out.locationLat).toBe('31.2')
    expect(out.locationLng).toBe('121.4')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('supplements')
    expect(out).not.toHaveProperty('contracts')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('bogus')
  })

  it('不设置 createdById', () => {
    const out = buildCustomerData({ fullName: 'A', createdById: 9 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('create：officeAddresses 子表过滤空白并 trim', () => {
    const out = buildCustomerData(
      {
        fullName: 'A',
        officeAddresses: [
          { address: '  北京市朝阳区  ' },
          { address: '   ' }, // 纯空白，过滤
          { address: '' }, // 空，过滤
        ],
      },
      'create',
    )
    expect(out.officeAddresses).toEqual({ create: [{ address: '北京市朝阳区' }] })
  })

  it('update：officeAddresses 先 deleteMany 再 create', () => {
    const out = buildCustomerData(
      { fullName: 'A', officeAddresses: [{ address: '广州' }] },
      'update',
    )
    expect(out.officeAddresses.deleteMany).toEqual({})
    expect(out.officeAddresses.create).toEqual([{ address: '广州' }])
  })

  it('缺省 officeAddresses 时为空 create 数组', () => {
    const out = buildCustomerData({ fullName: 'A' }, 'create')
    expect(out.officeAddresses).toEqual({ create: [] })
  })
})
