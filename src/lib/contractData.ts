/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONTRACT_INCLUDE = {
  createdBy: { select: { id: true, name: true, department: { select: { name: true } } } },
  customer: { select: { id: true, shortName: true } },
  salesOwner: { select: { id: true, name: true } },
  deliveryOwner: { select: { id: true, name: true } },
  invoices: true,
}

// Contract model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const CONTRACT_SCALAR_FIELDS = [
  'customerId',
  'contractName',
  'signingYear',
  'effectiveStart',
  'effectiveEnd',
  'expiryDate',
  'serviceType',
  'headhunterFeeRate',
  'billingMonths',
  'ropFeeRate',
  'salesOwnerId',
  'deliveryOwnerId',
  'contractFileUrl',
  'invoiceInfoText',
  'invoiceInfoFileUrl',
  'notes',
] as const

/** 仅保留白名单标量字段，过滤掉前端多传的脏字段 */
function pickScalars(data: any, fields: readonly string[]): any {
  const out: any = {}
  for (const f of fields) {
    if (f in data) out[f] = data[f]
  }
  return out
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含发票子表嵌套写） */
export function buildContractData(body: any, mode: 'create' | 'update') {
  const {
    invoices = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    customer,
    salesOwner,
    deliveryOwner,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void customer
  void salesOwner
  void deliveryOwner
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // 日期字段
  for (const f of ['effectiveStart', 'effectiveEnd', 'expiryDate']) {
    data[f] = data[f] ? new Date(data[f]) : null
  }

  // 数字外键 / 数值字段：空串归 null，否则转 Number
  for (const f of [
    'customerId',
    'signingYear',
    'headhunterFeeRate',
    'billingMonths',
    'ropFeeRate',
    'salesOwnerId',
    'deliveryOwnerId',
  ]) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  const inv = (invoices as any[])
    .filter((r) => r.invoiceType || r.verificationResult)
    .map((r) => ({
      invoiceType: r.invoiceType || null,
      verificationResult: r.verificationResult || null,
    }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, CONTRACT_SCALAR_FIELDS)
  out.invoices = mode === 'create' ? { create: inv } : { deleteMany: {}, create: inv }

  return out
}
