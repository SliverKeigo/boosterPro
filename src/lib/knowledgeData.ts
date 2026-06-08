/* eslint-disable @typescript-eslint/no-explicit-any */

export const KNOWLEDGE_INCLUDE = {
  createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
  updatedBy: { select: { id: true, name: true } },
  managementRecords: {
    include: { submitter: { select: { id: true, name: true } } },
  },
  internalLecturer: { select: { id: true, name: true } },
}

// KnowledgeBase model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const KNOWLEDGE_SCALAR_FIELDS = [
  'category',
  'tags',
  'keywords',
  'fileUrl',
  'notes',
  'trainingOutline',
  'internalLecturerId',
  'externalLecturer',
] as const

/** 仅保留白名单标量字段，过滤掉前端多传的脏字段 */
function pickScalars(data: any, fields: readonly string[]): any {
  const out: any = {}
  for (const f of fields) {
    if (f in data) out[f] = data[f]
  }
  return out
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含管理细则子表嵌套写） */
export function buildKnowledgeData(body: any, mode: 'create' | 'update') {
  const {
    managementRecords = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    internalLecturer,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void internalLecturer
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // tags：保证为字符串数组
  if (!Array.isArray(data.tags)) data.tags = data.tags ? [data.tags] : []

  // 条件文本字段：空串归 null
  for (const f of ['trainingOutline', 'externalLecturer']) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
  }

  // 内部讲师外键：空串 / undefined 归 null，否则转 Number
  if (data.internalLecturerId === '' || data.internalLecturerId === undefined) data.internalLecturerId = null
  else if (data.internalLecturerId !== null) data.internalLecturerId = Number(data.internalLecturerId)

  const records = (managementRecords as any[])
    .filter((r) => r.date || r.submitterId || r.details)
    .map((r) => ({
      date: r.date ? new Date(r.date) : null,
      submitterId:
        r.submitterId === '' || r.submitterId === undefined || r.submitterId === null
          ? null
          : Number(r.submitterId),
      details: r.details || null,
    }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, KNOWLEDGE_SCALAR_FIELDS)
  out.managementRecords =
    mode === 'create' ? { create: records } : { deleteMany: {}, create: records }

  return out
}
