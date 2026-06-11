import { describe, it, expect } from 'vitest'
import { buildContractData, CONTRACT_INCLUDE } from '@/lib/contractData'

describe('contractData - INCLUDE 常量', () => {
  it('CONTRACT_INCLUDE 为对象且含关联与发票子表', () => {
    expect(typeof CONTRACT_INCLUDE).toBe('object')
    expect(CONTRACT_INCLUDE.customer).toBeDefined()
    expect(CONTRACT_INCLUDE.salesOwner).toBeDefined()
    expect(CONTRACT_INCLUDE.deliveryOwner).toBeDefined()
    expect(CONTRACT_INCLUDE.invoices).toBe(true)
  })
})

describe('buildContractData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除 relation / 只读字段', () => {
    const out = buildContractData(
      {
        contractName: '年度合同',
        serviceType: 'RPO',
        notes: '备注',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        customer: {},
        salesOwner: {},
        deliveryOwner: {},
        _count: {},
        junk: 1,
      },
      'create',
    )
    expect(out.contractName).toBe('年度合同')
    expect(out.serviceType).toBe('RPO')
    expect(out.notes).toBe('备注')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('customer')
    expect(out).not.toHaveProperty('salesOwner')
    expect(out).not.toHaveProperty('deliveryOwner')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildContractData({ contractName: 'A', createdById: 3 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('日期字段：字符串 → Date，空值 → null', () => {
    const out = buildContractData(
      { effectiveStart: '2024-01-01', effectiveEnd: '', /* expiryDate 缺失 */ },
      'create',
    )
    expect(out.effectiveStart).toBeInstanceOf(Date)
    expect(out.effectiveEnd).toBeNull()
    expect(out.expiryDate).toBeNull()
  })

  it('数值 / 外键字段：空串与缺失 → null，数字字符串 → Number', () => {
    const out = buildContractData(
      {
        customerId: '10',
        signingYear: '2024',
        headhunterFeeRate: '20',
        billingMonths: '',
        ropFeeRate: 15,
        salesOwnerId: '4',
        // deliveryOwnerId 缺失
      },
      'create',
    )
    expect(out.customerId).toBe(10)
    expect(out.signingYear).toBe(2024)
    expect(out.headhunterFeeRate).toBe(20)
    expect(out.billingMonths).toBeNull()
    expect(out.ropFeeRate).toBe(15)
    expect(out.salesOwnerId).toBe(4)
    expect(out.deliveryOwnerId).toBeNull()
  })

  it('create：invoices 子表过滤空记录，空字段归 null', () => {
    const out = buildContractData(
      {
        contractName: 'A',
        invoices: [
          { invoiceType: '增值税专票', verificationResult: '通过', amount: '1000', number: 'N1', code: 'C1', sourceFileUrl: '/api/files/a.pdf', imageUrl: '/api/files/b.png' },
          { invoiceType: '', verificationResult: '' }, // 过滤
          { invoiceType: '普票' }, // verificationResult 缺失 → null
        ],
      },
      'create',
    )
    expect(out.invoices.create).toHaveLength(2)
    expect(out.invoices.create[0]).toEqual({
      invoiceType: '增值税专票',
      verificationResult: '通过',
      amount: '1000', number: 'N1', code: 'C1', issueDate: null, sourceFileUrl: '/api/files/a.pdf', imageUrl: '/api/files/b.png',
    })
    expect(out.invoices.create[1]).toEqual({
      invoiceType: '普票',
      verificationResult: null,
      amount: null, number: null, code: null, issueDate: null, sourceFileUrl: null, imageUrl: null,
    })
  })

  it('update：invoices 先 deleteMany 再 create', () => {
    const out = buildContractData(
      { contractName: 'A', invoices: [{ invoiceType: '普票' }] },
      'update',
    )
    expect(out.invoices.deleteMany).toEqual({})
    expect(out.invoices.create).toHaveLength(1)
  })
})
