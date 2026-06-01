/* eslint-disable @typescript-eslint/no-explicit-any */

export const CUSTOMER_INCLUDE = {
  officeAddresses: true,
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

  data.officeAddresses = mode === 'create' ? { create: oa } : { deleteMany: {}, create: oa }

  return data
}
