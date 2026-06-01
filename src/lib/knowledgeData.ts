/* eslint-disable @typescript-eslint/no-explicit-any */

export const KNOWLEDGE_INCLUDE = {
  managementRecords: {
    include: { submitter: { select: { id: true, name: true } } },
  },
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据（含管理细则子表嵌套写） */
export function buildKnowledgeData(body: any, mode: 'create' | 'update') {
  const {
    managementRecords = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // tags：保证为字符串数组
  if (!Array.isArray(data.tags)) data.tags = data.tags ? [data.tags] : []

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

  data.managementRecords =
    mode === 'create' ? { create: records } : { deleteMany: {}, create: records }

  return data
}
