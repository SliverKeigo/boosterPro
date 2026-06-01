/* eslint-disable @typescript-eslint/no-explicit-any */

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

  return data
}
