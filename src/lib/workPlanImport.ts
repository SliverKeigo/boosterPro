/* eslint-disable @typescript-eslint/no-explicit-any */
// 工作计划「主从-矩阵」导入：扁平表(每行=一个明细行)按「周计划id / 组+周」聚合重建
// WorkPlan + WorkPlanItem + WorkPlanAssignment。组员分配列格式：每行「组员名=计划日期」。
import { prisma } from '@/lib/prisma'
import { parseWorkbook, type ImportResult } from '@/lib/importServer'
import { resolveCustomer, resolveRequirement } from '@/lib/importConfigs'
import { assertCanWriteWorkPlan } from '@/lib/groups'
import type { CurrentUser } from '@/lib/permissions'

const cell = (row: any, k: string) => String(row[k] ?? '').trim()
const toDate = (s: string) => (s ? new Date(s.replace(' ', 'T')) : null)
const toBool = (s: string) => (s === '是' ? true : s === '否' ? false : null)

// 解析「组员分配」单元格：每行 "组员名=日期文本" → [{memberId, planDates}]，按组成员名解析 id
function parseAssignments(raw: string, memberByName: Map<string, number>): { memberId: number; planDates: string }[] {
  const out: { memberId: number; planDates: string }[] = []
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    const eq = s.indexOf('=')
    if (eq === -1) continue
    const name = s.slice(0, eq).trim()
    const dates = s.slice(eq + 1).trim()
    if (!name || !dates) continue
    const memberId = memberByName.get(name)
    if (memberId == null) throw new Error(`组员「${name}」不在该组成员中`)
    out.push({ memberId, planDates: dates })
  }
  return out
}

async function buildItem(row: any, memberByName: Map<string, number>, sortOrder: number) {
  const customerName = cell(row, '客户名称')
  const requirementName = cell(row, '岗位名称')
  const customerId = customerName ? await resolveCustomer(customerName) : null
  if (customerName && customerId == null) throw new Error(`客户「${customerName}」找不到匹配`)
  const requirementId = requirementName ? await resolveRequirement(requirementName) : null
  if (requirementName && requirementId == null) throw new Error(`岗位「${requirementName}」找不到匹配`)
  const assignments = parseAssignments(cell(row, '组员分配'), memberByName)
  return {
    customerId,
    requirementId,
    progressNote: cell(row, '交付进展') || null,
    positionOpenDate: toDate(cell(row, '岗位开放时间')),
    routineHunting: toBool(cell(row, '是否例行寻猎')),
    participation: assignments.length, // 本周参与度自动计算
    sortOrder,
    assignments: { create: assignments },
  }
}

export async function runWorkPlanImport(buf: ArrayBuffer, user: CurrentUser): Promise<ImportResult> {
  const rows = await parseWorkbook(buf)
  // 按「周计划id」聚合；无 id 的按「组+周区间」聚合为新计划
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const pid = cell(row, '周计划id')
    const key = pid || `new::${cell(row, '组')}::${cell(row, '周开始')}::${cell(row, '周结束')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const built: { id?: number; data: any; row: number }[] = []
  const errors: { row: number; msg: string }[] = []
  for (const grp of groups.values()) {
    const first = grp[0]
    try {
      const groupName = cell(first, '组')
      if (!groupName) throw new Error('缺少「组」')
      const g = await prisma.group.findFirst({ where: { name: groupName }, select: { id: true, members: { select: { id: true, name: true } } } })
      if (!g) throw new Error(`组「${groupName}」不存在`)
      await assertCanWriteWorkPlan(user, g.id)
      const memberByName = new Map(g.members.map((m) => [m.name, m.id]))
      const weekStart = cell(first, '周开始')
      const weekEnd = cell(first, '周结束')
      if (!weekStart || !weekEnd) throw new Error('缺少「周开始/周结束」')
      const items = []
      for (let i = 0; i < grp.length; i++) {
        const r = grp[i]
        // 空明细行（仅主表占位）跳过：客户/岗位/进展/组员分配全空
        if (!cell(r, '客户名称') && !cell(r, '岗位名称') && !cell(r, '交付进展') && !cell(r, '组员分配')) continue
        items.push(await buildItem(r, memberByName, items.length))
      }
      const pid = cell(first, '周计划id')
      if (pid) {
        const exist = await prisma.workPlan.findUnique({ where: { id: Number(pid) }, select: { id: true } })
        if (!exist) throw new Error(`周计划 id=${pid} 不存在`)
      }
      built.push({
        id: pid ? Number(pid) : undefined,
        data: { groupId: g.id, weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), deliveryStrategy: cell(first, '交付策略') || null, items },
        row: first.__row,
      })
    } catch (e: any) {
      errors.push({ row: first.__row, msg: e instanceof Error ? e.message : String(e) })
    }
  }
  if (errors.length) return { created: 0, updated: 0, failed: errors.length, errors }

  let created = 0
  let updated = 0
  await prisma.$transaction(async (tx: any) => {
    for (const b of built) {
      if (b.id != null) {
        await tx.workPlanItem.deleteMany({ where: { workPlanId: b.id } })
        await tx.workPlan.update({ where: { id: b.id }, data: { ...b.data, items: { create: b.data.items } } })
        updated++
      } else {
        await tx.workPlan.create({ data: { ...b.data, createdById: user.id, items: { create: b.data.items } } })
        created++
      }
    }
  })
  return { created, updated, failed: 0, errors: [] }
}
