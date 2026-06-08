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

  // 出生年份为 Int(年)：空串 / undefined / null 归 null，否则转 Number
  if (data.birthYear === '' || data.birthYear === undefined || data.birthYear === null) {
    data.birthYear = null
  } else {
    data.birthYear = Number(data.birthYear)
  }

  // 人才标签为自由文本(不按逗号分隔)：前端已传单元素数组；若传字符串，整段作为单元素存入 text[]。
  if (!Array.isArray(data.tags)) {
    data.tags = data.tags && String(data.tags).trim() ? [String(data.tags).trim()] : []
  }

  // 白名单过滤掉多余键
  return pickScalars(data, TALENT_POOL_SCALAR_FIELDS)
}
