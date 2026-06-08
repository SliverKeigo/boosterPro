/* eslint-disable @typescript-eslint/no-explicit-any */

import { prisma } from '@/lib/prisma'
import { HttpError } from '@/lib/apiError'

export const CUSTOMER_INCLUDE = {
  createdBy: { select: { id: true, name: true, department: { select: { name: true } } } },
  officeAddresses: true,
}

// Customer model 的已知标量字段白名单（不含 relation / 子表 / id / createdAt / updatedAt / createdById）
const CUSTOMER_SCALAR_FIELDS = [
  'fullName',
  'shortName',
  'formerName',
  'industry',
  'region',
  'detailedAddress',
  'companyCulture',
  'openingSpeech',
  'benchmarkCompanies',
  'locationLat',
  'locationLng',
  'attachmentUrl',
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
export function buildCustomerData(body: any, mode: 'create' | 'update') {
  const {
    officeAddresses = [],
    // 剔除 relation 对象与只读字段，避免传给 Prisma 报错
    supplements,
    requirements,
    candidates,
    contracts,
    _count,
    id,
    createdAt,
    updatedAt,
    ...rest
  } = body
  void supplements
  void requirements
  void candidates
  void contracts
  void _count
  void id
  void createdAt
  void updatedAt

  const data: any = { ...rest }

  const oa = (officeAddresses as any[])
    .filter((r) => r.address && String(r.address).trim())
    .map((r) => ({ address: String(r.address).trim() }))

  // 白名单过滤掉多余键后，再附加子表嵌套写
  const out = pickScalars(data, CUSTOMER_SCALAR_FIELDS)
  out.officeAddresses = mode === 'create' ? { create: oa } : { deleteMany: {}, create: oa }

  return out
}

/**
 * 客户名称查重（应用层）：客户全称 fullName / 客户简称 shortName 都不得与库中任一客户的
 * fullName 或 shortName 重复（交叉去重，trim 后比较，大小写不敏感）。命中即抛 409。
 * @param data    含 fullName / shortName 的表单数据
 * @param excludeId 更新时排除自身 id
 */
export async function assertCustomerUnique(
  data: { fullName?: string | null; shortName?: string | null },
  excludeId?: number,
): Promise<void> {
  const names = [data.fullName, data.shortName]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v): v is string => v.length > 0)
  if (names.length === 0) return

  // fullName / shortName 各一个 in 条件，均大小写不敏感（mode:'insensitive'）→ 交叉比对
  const hit = await prisma.customer.findFirst({
    where: {
      id: excludeId != null ? { not: excludeId } : undefined,
      OR: [
        { fullName: { in: names, mode: 'insensitive' } },
        { shortName: { in: names, mode: 'insensitive' } },
      ],
    },
    select: { fullName: true, shortName: true },
  })
  if (hit) {
    const lowered = names.map((n) => n.toLowerCase())
    // 找出到底是哪个名字撞了，以及撞上的是现有客户的哪个字段
    const dup =
      (hit.fullName && lowered.includes(hit.fullName.trim().toLowerCase()) ? hit.fullName : null) ??
      (hit.shortName && lowered.includes(hit.shortName.trim().toLowerCase()) ? hit.shortName : null) ??
      names[0]
    const existingLabel = hit.fullName || hit.shortName || ''
    throw new HttpError(409, `客户名称/简称「${dup}」与现有客户「${existingLabel}」重复`)
  }
}
