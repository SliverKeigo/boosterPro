/* eslint-disable @typescript-eslint/no-explicit-any */

export const SUPPLEMENT_INCLUDE = {
  customer: { select: { id: true, shortName: true } },
  demandUpdates: true,
  customerProfiles: true,
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含子表嵌套写） */
export function buildSupplementData(body: any, mode: 'create' | 'update') {
  const {
    demandUpdates = [],
    customerProfiles = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    customer,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void customer
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // 数字外键：空串归 null，否则转 Number
  if (data.customerId === '' || data.customerId === undefined) data.customerId = null
  else if (data.customerId !== null) data.customerId = Number(data.customerId)

  const updates = (demandUpdates as any[])
    .filter((r) => r.date || r.content)
    .map((r) => ({ date: r.date ? new Date(r.date) : null, content: r.content || null }))
  const profiles = (customerProfiles as any[])
    .filter((r) => r.specialty || r.description)
    .map((r) => ({ specialty: r.specialty || null, description: r.description || null }))

  data.demandUpdates = mode === 'create' ? { create: updates } : { deleteMany: {}, create: updates }
  data.customerProfiles = mode === 'create' ? { create: profiles } : { deleteMany: {}, create: profiles }

  return data
}
