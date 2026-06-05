/* eslint-disable @typescript-eslint/no-explicit-any */

export const CUSTOMER_INCLUDE = {
  officeAddresses: true,
}

// Customer model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const CUSTOMER_SCALAR_FIELDS = [
  'fullName',
  'shortName',
  'formerName',
  'industry',
  'region',
  'detailedAddress',
  'companyCulture',
  'openingSpeech',
  'benchmarkCompanies',
  'locationLat',
  'locationLng',
  'attachmentUrl',
] as const

/** 仅保留白名单标量字段，过滤掉前端多传的脏字段 */
function pickScalars(data: any, fields: readonly string[]): any {
  const out: any = {}
  for (const f of fields) {
    if (f in data) out[f] = data[f]
  }
  return out
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含子表嵌套写） */
export function buildCustomerData(body: any, mode: 'create' | 'update') {
  const {
    officeAddresses = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    supplements,
    requirements,
    candidates,
    contracts,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void supplements
  void requirements
  void candidates
  void contracts
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  const oa = (officeAddresses as any[])
    .filter((r) => r.address && String(r.address).trim())
    .map((r) => ({ address: String(r.address).trim() }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, CUSTOMER_SCALAR_FIELDS)
  out.officeAddresses = mode === 'create' ? { create: oa } : { deleteMany: {}, create: oa }

  return out
}
