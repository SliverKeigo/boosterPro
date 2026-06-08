/* eslint-disable @typescript-eslint/no-explicit-any */

// 列表用：含保证期沟通 / 风险事件子表（列表页“显示列”可开启其摘要列）
export const CANDIDATE_LIST_INCLUDE = {
  createdBy: { select: { id: true, name: true, department: { select: { name: true } } } },
  customer: { select: { id: true, shortName: true } },
  requirement: { select: { id: true, positionName: true } },
  submitter: { select: { id: true, name: true } },
  guaranteeCommunications: true,
  riskEvents: true,
}

// 详情 / 创建更新返回用
export const CANDIDATE_INCLUDE = {
  ...CANDIDATE_LIST_INCLUDE,
}

// Candidate model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const CANDIDATE_SCALAR_FIELDS = [
  'name',
  'birthYear',
  'phone',
  'email',
  'education',
  'schoolTier',
  'customerId',
  'customerShortName',
  'requirementId',
  'recruitmentParty',
  'recruitmentChannel',
  'recommendationTime',
  'recommendationStatus',
  'recommendationReportUrl',
  'recommendationReason',
  'interviewProgress',
  'failureReason',
  'offerDate',
  'offerOnboardDate',
  'offerFileUrl',
  'backgroundCheckReportUrl',
  'actualOnboardDate',
  'salaryPlan',
  'guaranteePeriodEnd',
  'guaranteePeriodMonths',
  'tags',
  'notes',
  'submitDepartmentId',
  'submitterId',
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

  // 数字外键 / 数值字段：空串归 null，否则转 Number（birthYear 现为 Int 年份）
  for (const f of ['customerId', 'requirementId', 'submitterId', 'submitDepartmentId', 'guaranteePeriodMonths', 'birthYear']) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  // 枚举字段：空串归 null（否则 Prisma 枚举校验会报错导致 500）
  for (const f of ['education']) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
  }

  // schoolTier 现为 String[]（存枚举 key）：作为数组透传，空/非数组归 []
  data.schoolTier = Array.isArray(data.schoolTier)
    ? data.schoolTier
    : data.schoolTier
      ? [data.schoolTier]
      : []

  const gc = (guaranteeCommunications as any[])
    .filter((r) => r.date || r.content)
    .map((r) => ({ date: r.date ? new Date(r.date) : null, content: r.content || null }))
  const re = (riskEvents as any[])
    .filter((r) => r.date || r.riskDescription)
    .map((r) => ({ date: r.date ? new Date(r.date) : null, riskDescription: r.riskDescription || null }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, CANDIDATE_SCALAR_FIELDS)
  out.guaranteeCommunications = mode === 'create' ? { create: gc } : { deleteMany: {}, create: gc }
  out.riskEvents = mode === 'create' ? { create: re } : { deleteMany: {}, create: re }

  return out
}
