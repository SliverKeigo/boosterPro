/* eslint-disable @typescript-eslint/no-explicit-any */

export const CUSTOMER_CONTACT_INCLUDE = {
  createdBy: { select: { id: true, name: true, department: { select: { name: true } } } },
  customer: { select: { id: true, shortName: true } },
  submitter: { select: { id: true, name: true } },
  contacts: true,
}

// CustomerContact model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const CUSTOMER_CONTACT_SCALAR_FIELDS = [
  'title',
  'customerId',
  'submitterId',
  'submitDepartmentId',
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
export function buildCustomerContactData(body: any, mode: 'create' | 'update') {
  const {
    contacts = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    customer,
    submitter,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void customer
  void submitter
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  // 数字外键 / 数值字段：空串归 null，否则转 Number
  for (const f of ['customerId', 'submitterId', 'submitDepartmentId']) {
    if (data[f] === '' || data[f] === undefined) data[f] = null
    else if (data[f] !== null) data[f] = Number(data[f])
  }

  const people = (contacts as any[])
    .filter((r) => r.contactName || r.contactTitle || r.contactPhone || r.contactEmail || r.contactHobby)
    .map((r) => ({
      contactName: r.contactName || null,
      contactTitle: r.contactTitle || null,
      contactPhone: r.contactPhone || null,
      contactEmail: r.contactEmail || null,
      contactHobby: r.contactHobby || null,
    }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, CUSTOMER_CONTACT_SCALAR_FIELDS)
  out.contacts = mode === 'create' ? { create: people } : { deleteMany: {}, create: people }

  return out
}
