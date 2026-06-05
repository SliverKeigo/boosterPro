/* eslint-disable @typescript-eslint/no-explicit-any */
// 工作计划（三层）的查询 include 与「前端明细行 → Prisma 嵌套 create」映射，路由共享。

export const WORK_PLAN_INCLUDE = {
  group: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      customer: { select: { id: true, shortName: true } },
      requirement: { select: { id: true, positionName: true } },
      assignments: { include: { member: { select: { id: true, name: true } } } },
    },
  },
}

function toBool(v: any): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === '是' || v === 'true' || v === 1 || v === '1') return true
  if (v === '否' || v === 'false' || v === 0 || v === '0') return false
  return null
}
const numOrNull = (v: any) => (v === '' || v == null ? null : Number(v))

// 一条明细行 → Prisma 嵌套 create（含 assignments；只存有日期的格，空格不入库 → 稀疏存储）
export function buildItemCreate(it: any, index = 0) {
  const assignments = (Array.isArray(it?.assignments) ? it.assignments : [])
    .filter((a: any) => a && a.memberId && String(a.planDates ?? '').trim())
    .map((a: any) => ({ memberId: Number(a.memberId), planDates: String(a.planDates).trim() }))
  return {
    customerId: numOrNull(it.customerId),
    requirementId: numOrNull(it.requirementId),
    progressNote: it.progressNote || null,
    positionOpenDate: it.positionOpenDate ? new Date(it.positionOpenDate) : null,
    routineHunting: toBool(it.routineHunting),
    participation: numOrNull(it.participation),
    sortOrder: it.sortOrder != null ? Number(it.sortOrder) : index,
    assignments: { create: assignments },
  }
}
