/* eslint-disable @typescript-eslint/no-explicit-any */

export const OPPORTUNITY_INCLUDE = {
  salesOwner: { select: { id: true, name: true } },
  progressRecords: true,
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含子表嵌套写） */
export function buildOpportunityData(body: any, mode: 'create' | 'update') {
  const {
    progressRecords = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    salesOwner,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void salesOwner
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // 数字外键：空串 / undefined 归 null，否则转 Number
  if (data.salesOwnerId === '' || data.salesOwnerId === undefined) data.salesOwnerId = null
  else if (data.salesOwnerId !== null) data.salesOwnerId = Number(data.salesOwnerId)

  const pr = (progressRecords as any[])
    .filter((r) => r.date || r.description)
    .map((r) => ({
      date: r.date ? new Date(r.date) : null,
      description: r.description || null,
    }))

  data.progressRecords = mode === 'create' ? { create: pr } : { deleteMany: {}, create: pr }

  return data
}
