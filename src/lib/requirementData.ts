/* eslint-disable @typescript-eslint/no-explicit-any */

export const REQUIREMENT_INCLUDE = {
  customer: { select: { id: true, shortName: true } },
  positionProfiles: true,
  urgentRecords: true,
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含子表嵌套写） */
export function buildRequirementData(body: any, mode: 'create' | 'update') {
  const {
    positionProfiles = [],
    urgentRecords = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    customer,
    candidates,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void customer
  void candidates
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // 日期字段
  for (const f of ['deadline', 'followDate']) {
    data[f] = data[f] ? new Date(data[f]) : null
  }

  // 数字外键 / 数值字段：空串归 null，否则转 Number
  for (const f of [
    'customerId',
    'headcount',
    'monthlySalaryMin',
    'monthlySalaryMax',
    'annualSalaryMin',
    'annualSalaryMax',
    'ageMin',
    'ageMax',
  ]) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  // 枚举：空串归 null
  if (data.genderRequirement === '' || data.genderRequirement === undefined) {
    data.genderRequirement = null
  }

  const profiles = (positionProfiles as any[])
    .filter((r) => r.knowledgeCategory || r.knowledgeAmount)
    .map((r) => ({
      knowledgeCategory: r.knowledgeCategory || null,
      knowledgeAmount: r.knowledgeAmount || null,
    }))
  const urgent = (urgentRecords as any[])
    .filter((r) => r.memberId || r.date)
    .map((r) => ({
      memberId: r.memberId === '' || r.memberId == null ? null : Number(r.memberId),
      date: r.date ? new Date(r.date) : null,
    }))

  data.positionProfiles = mode === 'create' ? { create: profiles } : { deleteMany: {}, create: profiles }
  data.urgentRecords = mode === 'create' ? { create: urgent } : { deleteMany: {}, create: urgent }

  return data
}
