/* eslint-disable @typescript-eslint/no-explicit-any */

export const CANDIDATE_INCLUDE = {
  customer: { select: { id: true, shortName: true } },
  requirement: { select: { id: true, positionName: true } },
  submitter: { select: { id: true, name: true } },
  guaranteeCommunications: true,
  riskEvents: true,
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含子表嵌套写） */
export function buildCandidateData(body: any, mode: 'create' | 'update') {
  const {
    guaranteeCommunications = [],
    riskEvents = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    customer,
    requirement,
    submitter,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void customer
  void requirement
  void submitter
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  for (const f of [
    'offerDate',
    'actualOnboardDate',
    'guaranteePeriodEnd',
    'recommendationTime',
    'offerOnboardDate',
  ]) {
    data[f] = data[f] ? new Date(data[f]) : null
  }
  if (!Array.isArray(data.tags)) data.tags = data.tags ? [data.tags] : []

  // 数字外键 / 数值字段：空串归 null，否则转 Number
  for (const f of ['customerId', 'requirementId', 'submitterId', 'submitDepartmentId', 'birthYear', 'guaranteePeriodMonths']) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  const gc = (guaranteeCommunications as any[])
    .filter((r) => r.date || r.content)
    .map((r) => ({ date: r.date ? new Date(r.date) : null, content: r.content || null }))
  const re = (riskEvents as any[])
    .filter((r) => r.date || r.riskDescription)
    .map((r) => ({ date: r.date ? new Date(r.date) : null, riskDescription: r.riskDescription || null }))

  data.guaranteeCommunications = mode === 'create' ? { create: gc } : { deleteMany: {}, create: gc }
  data.riskEvents = mode === 'create' ? { create: re } : { deleteMany: {}, create: re }

  return data
}
