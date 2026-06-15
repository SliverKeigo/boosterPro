import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 工作计划「新增初始化」聚合接口（一周一条、涵盖全部组）：
// - members：全部用户（矩阵列，需求 1：每页都显示全部人员）。
// - groups：每个组 + 该组成员录入的「在招」客户需求（按岗位一行，带客户简称/岗位开放时间=需求创建时间），
//   前端据此按组分页自动生成明细行（行带 groupId）。
// - lastProgress：上一份周计划的 (customerId:requirementId → 非空交付进展)，新建下周时对「同客户同岗位」自动带入。
// 要求 WORK_PLAN:VIEW（能看工作计划即可初始化；实际创建在 POST 由 CREATE 守卫）。
const CLOSED_STATUSES = ['关闭', '暂停']

export async function GET() {
  try {
    await requirePermission('WORK_PLAN', 'VIEW')

    // 矩阵列：全部用户
    const members = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })

    // 各组 + 本组成员录入的在招需求（每岗位一行）
    const groupRows = await prisma.group.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, members: { select: { id: true } } },
    })
    const groups = await Promise.all(
      groupRows.map(async (g) => {
        const memberIds = g.members.map((m) => m.id)
        const reqs = memberIds.length
          ? await prisma.requirement.findMany({
              where: { createdById: { in: memberIds } },
              select: {
                id: true,
                positionName: true,
                customerId: true,
                createdAt: true,
                status: true,
                customer: { select: { shortName: true } },
              },
              orderBy: [{ customerId: 'asc' }, { createdAt: 'desc' }],
            })
          : []
        const requirements = reqs
          .filter((r) => {
            const st = Array.isArray(r.status) ? r.status : []
            return st.length === 0 || st.some((s) => !CLOSED_STATUSES.includes(s))
          })
          .map((r) => ({
            requirementId: r.id,
            positionName: r.positionName,
            customerId: r.customerId,
            customerShortName: r.customer?.shortName ?? '',
            positionOpenDate: r.createdAt,
          }))
        return { groupId: g.id, groupName: g.name, requirements }
      }),
    )

    // 上一份周计划 → (customerId:requirementId → 非空交付进展)
    const last = await prisma.workPlan.findFirst({
      orderBy: { weekStart: 'desc' },
      select: { items: { select: { customerId: true, requirementId: true, progressNote: true } } },
    })
    const lastProgress: Record<string, string> = {}
    for (const it of last?.items ?? []) {
      if (it.customerId != null && it.requirementId != null && it.progressNote && it.progressNote.trim()) {
        lastProgress[`${it.customerId}:${it.requirementId}`] = it.progressNote
      }
    }

    return NextResponse.json({ members, groups, lastProgress })
  } catch (e) {
    return handleApiError(e)
  }
}
