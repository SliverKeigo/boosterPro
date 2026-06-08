/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'
import { RESOURCE_KEYS } from '@/lib/resources'

// 登录守卫：未登录一律 401（数据共享授权对所有登录用户开放，权限差异在各操作内部判定）。
async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, '未登录或登录已过期')
  return user
}

const ACCESS_VALUES = ['VIEW', 'EDIT']
const SOURCE_TYPES = ['OWNER', 'DEPARTMENT']
const GRANTEE_TYPES = ['USER', 'DEPARTMENT']

interface NormalizedGrant {
  resource: string
  sourceType: string
  sourceUserId: number | null
  sourceDeptId: number | null
  granteeType: string
  granteeUserId: number | null
  granteeDeptId: number | null
  access: string
}

/**
 * 校验授权输入并归一化：
 * - resource ∈ RESOURCE_KEYS
 * - access ∈ ['VIEW','EDIT']
 * - sourceType ∈ ['OWNER','DEPARTMENT']：OWNER 须 sourceUserId 有效，DEPARTMENT 须 sourceDeptId 有效（互斥，另一侧置 null）
 * - granteeType ∈ ['USER','DEPARTMENT']：USER 须 granteeUserId 有效，DEPARTMENT 须 granteeDeptId 有效（互斥，另一侧置 null）
 * 所有 id 经 Number() 后须为有限正整数。
 */
function validateGrantInput(body: any): NormalizedGrant {
  const { resource, access, sourceType, granteeType } = body ?? {}

  if (typeof resource !== 'string' || !RESOURCE_KEYS.includes(resource as any)) {
    throw new HttpError(400, '非法的资源标识')
  }
  if (typeof access !== 'string' || !ACCESS_VALUES.includes(access)) {
    throw new HttpError(400, '非法的授权级别')
  }
  if (typeof sourceType !== 'string' || !SOURCE_TYPES.includes(sourceType)) {
    throw new HttpError(400, '非法的来源类型')
  }
  if (typeof granteeType !== 'string' || !GRANTEE_TYPES.includes(granteeType)) {
    throw new HttpError(400, '非法的受让类型')
  }

  const toPositiveInt = (v: unknown, label: string): number => {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, label)
    return n
  }

  let sourceUserId: number | null = null
  let sourceDeptId: number | null = null
  if (sourceType === 'OWNER') {
    sourceUserId = toPositiveInt(body.sourceUserId, '请选择来源用户')
  } else {
    sourceDeptId = toPositiveInt(body.sourceDeptId, '请选择来源部门')
  }

  let granteeUserId: number | null = null
  let granteeDeptId: number | null = null
  if (granteeType === 'USER') {
    granteeUserId = toPositiveInt(body.granteeUserId, '请选择受让用户')
  } else {
    granteeDeptId = toPositiveInt(body.granteeDeptId, '请选择受让部门')
  }

  return {
    resource,
    sourceType,
    sourceUserId,
    sourceDeptId,
    granteeType,
    granteeUserId,
    granteeDeptId,
    access,
  }
}

// 把一批 id 解析为「id → 名称」映射（查无的 id 不入表，前端按缺省占位显示）。
async function nameMap(
  ids: number[],
  finder: (where: { id: { in: number[] } }) => Promise<{ id: number; name: string }[]>,
): Promise<Record<number, string>> {
  const unique = [...new Set(ids.filter((x) => x != null))]
  if (unique.length === 0) return {}
  const rows = await finder({ id: { in: unique } })
  return Object.fromEntries(rows.map((r) => [r.id, r.name]))
}

// 列表：管理员看全部；普通用户看「自己发出的」（sourceUserId=自己 或 grantedById=自己）。
// 附带 source/grantee 的名称映射，前端据此渲染中文。
export async function GET() {
  try {
    const user = await requireUser()
    const where = user.isAdmin
      ? undefined
      : { OR: [{ sourceUserId: user.id }, { grantedById: user.id }] }
    const data = await prisma.dataGrant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // 汇总需要解析名称的 id（用户侧 / 部门侧分开查），减少查询次数
    const userIds: number[] = []
    const deptIds: number[] = []
    for (const g of data) {
      if (g.sourceUserId != null) userIds.push(g.sourceUserId)
      if (g.granteeUserId != null) userIds.push(g.granteeUserId)
      if (g.grantedById != null) userIds.push(g.grantedById)
      if (g.sourceDeptId != null) deptIds.push(g.sourceDeptId)
      if (g.granteeDeptId != null) deptIds.push(g.granteeDeptId)
    }
    const [users, departments] = await Promise.all([
      nameMap(userIds, (w) =>
        prisma.user.findMany({ where: w, select: { id: true, name: true } }),
      ),
      nameMap(deptIds, (w) =>
        prisma.department.findMany({ where: w, select: { id: true, name: true } }),
      ),
    ])

    return NextResponse.json({ data, users, departments })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新建授权：
// - 权限：sourceType=OWNER 要求 sourceUserId===当前用户 || 管理员；sourceType=DEPARTMENT 仅管理员（无部门负责人字段）。
// - grantedById 置当前用户。
// - 同 (resource,sourceType,source*,granteeType,grantee*) 已存在则更新 access（EDIT 覆盖 VIEW），否则 create。
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json()
    const g = validateGrantInput(body)

    if (g.sourceType === 'OWNER') {
      if (!user.isAdmin && g.sourceUserId !== user.id) {
        throw new HttpError(403, '只能共享本人录入的数据')
      }
    } else if (!user.isAdmin) {
      throw new HttpError(403, '部门级共享仅管理员可操作')
    }

    // 唯一定位条件：同一来源 + 受让 + 资源 视为同一条授权（不含 access）
    const matchWhere = {
      resource: g.resource,
      sourceType: g.sourceType,
      sourceUserId: g.sourceUserId,
      sourceDeptId: g.sourceDeptId,
      granteeType: g.granteeType,
      granteeUserId: g.granteeUserId,
      granteeDeptId: g.granteeDeptId,
    }

    const existing = await prisma.dataGrant.findFirst({ where: matchWhere })
    if (existing) {
      // EDIT 覆盖 VIEW；已是 EDIT 而新值为 VIEW 时不降级（保持更高权限）
      const access = existing.access === 'EDIT' || g.access === 'EDIT' ? 'EDIT' : 'VIEW'
      const item = await prisma.dataGrant.update({
        where: { id: existing.id },
        data: { access, grantedById: user.id },
      })
      return NextResponse.json(item)
    }

    const item = await prisma.dataGrant.create({
      data: { ...g, grantedById: user.id },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
