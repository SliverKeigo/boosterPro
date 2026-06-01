/* eslint-disable @typescript-eslint/no-explicit-any */

// TalentPool model 的已知标量字段白名单（不含 relation / id / createdAt / updatedAt / createdById）
const TALENT_POOL_SCALAR_FIELDS = [
  'name',
  'birthYear',
  'gender',
  'education',
  'phone',
  'currentPosition',
  'targetPosition',
  'positionType',
  'positionLevel',
  'age',
  'tags',
  'resumeUrl',
] as const

/** 仅保留白名单标量字段，过滤掉前端多传的脏字段 */
function pickScalars(data: any, fields: readonly string[]): any {
  const out: any = {}
  for (const f of fields) {
    if (f in data) out[f] = data[f]
  }
  return out
}

/** 把前端表单 payload 清洗为 Prisma create/update 数据 */
export function buildTalentPoolData(body: any) {
  const {
    // 剔除只读字段，避免传给 Prisma 报错
    id,
    createdAt,
    updatedAt,
    _count,
    ...rest
  } = body
  void id
  void createdAt
  void updatedAt
  void _count

  const data: any = { ...rest }

  // 性别枚举：空串归 null
  if (data.gender === '') data.gender = null

  // 数值字段：空串 / undefined 归 null，否则转 Number
  for (const f of ['birthYear', 'age']) {
    if (data[f] === '' || data[f] === undefined || data[f] === null) data[f] = null
    else data[f] = Number(data[f])
  }

  // 标签：逗号字符串 → 数组
  if (!Array.isArray(data.tags)) {
    data.tags = data.tags
      ? String(data.tags)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : []
  }

  // 白名单过滤掉多余键
  return pickScalars(data, TALENT_POOL_SCALAR_FIELDS)
}
