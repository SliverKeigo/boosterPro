/* eslint-disable @typescript-eslint/no-explicit-any */

export const REQUIREMENT_INCLUDE = {
  createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
  updatedBy: { select: { id: true, name: true } },
  customer: { select: { id: true, shortName: true } },
  positionProfiles: true,
  // member 供前端「加急记录」子表展示成员姓名（buildRequirementData 重建子表时只取 memberId/date，多余键安全）
  urgentRecords: { include: { member: { select: { id: true, name: true } } } },
}

// Requirement model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const REQUIREMENT_SCALAR_FIELDS = [
  'customerId',
  'recruiter',
  'positionName',
  'headcount',
  'monthlySalary',
  'annualSalary',
  'ageRange',
  'genderRequirement',
  'educationRequirement',
  'languageRequirement',
  'status',
  'deadline',
  'baseCity',
  'jobDescription',
  'talentProfile',
  'projectExperience',
  'closeReason',
  'notes',
  'attachmentUrl',
  'latestUpdate',
  'industry',
  'followDate',
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
  ]) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  // 枚举：空串归 null
  if (data.genderRequirement === '' || data.genderRequirement === undefined) {
    data.genderRequirement = null
  }

  // 岗位状态：多选数组（兼容历史单值字符串 / 空值）
  if (Array.isArray(data.status)) data.status = data.status.filter(Boolean)
  else if (typeof data.status === 'string' && data.status.trim()) data.status = [data.status.trim()]
  else data.status = []

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

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, REQUIREMENT_SCALAR_FIELDS)
  out.positionProfiles = mode === 'create' ? { create: profiles } : { deleteMany: {}, create: profiles }
  out.urgentRecords = mode === 'create' ? { create: urgent } : { deleteMany: {}, create: urgent }

  return out
}
