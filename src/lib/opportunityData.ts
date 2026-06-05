/* eslint-disable @typescript-eslint/no-explicit-any */

export const OPPORTUNITY_INCLUDE = {
  createdBy: { select: { id: true, name: true, department: { select: { name: true } } } },
  salesOwner: { select: { id: true, name: true } },
  progressRecords: true,
}

// Opportunity model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const OPPORTUNITY_SCALAR_FIELDS = [
  'name',
  'description',
  'region',
  'status',
  'nature',
  'contactName',
  'contactTitle',
  'contactInfo',
  'salesDecisionInfo',
  'customerDecisionMaker',
  'decisionMakerDescription',
  'salesOwnerId',
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

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, OPPORTUNITY_SCALAR_FIELDS)
  out.progressRecords = mode === 'create' ? { create: pr } : { deleteMany: {}, create: pr }

  return out
}
