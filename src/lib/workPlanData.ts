/* eslint-disable @typescript-eslint/no-explicit-any */
// 工作计划（三层）的查询 include 与「前端明细行 → Prisma 嵌套 create」映射，路由共享。
// 改造后：周计划一周一条（不绑组）；明细行带 groupId 标记来源组（按组分页）；assignments 的
// planDates 存 JSON 日期数组字符串（如 ["2026-06-01","2026-06-03"]）。

export const WORK_PLAN_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      group: { select: { id: true, name: true } },
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

// 规范化为 ISO 日期字符串数组：接受 string[] 或 JSON/逗号/顿号分隔字符串；去空、去重、升序。
// 兼容前端 MultiDatePicker 的 string[] 与历史的自由文本（如 "6.1、6.3" 拆为多项）。
function normDates(v: any): string[] {
  let arr: any[] = []
  if (Array.isArray(v)) arr = v
  else if (typeof v === 'string' && v.trim()) {
    const s = v.trim()
    try {
      const p = JSON.parse(s)
      arr = Array.isArray(p) ? p : [s]
    } catch {
      arr = s.split(/[,、，]/)
    }
  }
  const out = arr.map((x) => String(x).trim()).filter(Boolean)
  return Array.from(new Set(out)).sort()
}

// 一条明细行 → Prisma 嵌套 create：
// - groupId：明细来源组（按组分页、必填）。
// - assignments：每格 planDates 存 JSON 日期数组字符串；无日期的格不入库（稀疏存储）。
export function buildItemCreate(it: any, index = 0) {
  const assignments = (Array.isArray(it?.assignments) ? it.assignments : [])
    .map((a: any) => ({ memberId: Number(a?.memberId), dates: normDates(a?.planDates) }))
    .filter((a: { memberId: number; dates: string[] }) => a.memberId && a.dates.length)
    .map((a: { memberId: number; dates: string[] }) => ({ memberId: a.memberId, planDates: JSON.stringify(a.dates) }))
  return {
    groupId: Number(it.groupId),
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
