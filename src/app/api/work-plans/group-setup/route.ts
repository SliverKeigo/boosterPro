import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 工作计划「选组初始化」聚合接口：
// - members：该组成员（矩阵列）。
// - requirements：组员录入的「在招」客户需求（status 含任一非『关闭/暂停』），按岗位一行，
//   带客户简称与岗位开放时间(=需求创建时间)。
// - lastProgress：该组上一份周计划的 (customerId:requirementId → 交付进展简述)，用于新建下周时
//   对「同客户同岗位」自动带入上周非空进展。
// 仅要求登录（创建权限在提交时由 /api/work-plans 守卫）。
const CLOSED_STATUSES = ['关闭', '暂停']

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    const groupId = Number(new URL(req.url).searchParams.get('groupId'))
    if (!Number.isInteger(groupId) || groupId <= 0) throw new HttpError(400, '非法的组 ID')

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, members: { select: { id: true, name: true } } },
    })
    if (!group) throw new HttpError(404, '组不存在')
    const memberIds = group.members.map((m) => m.id)

    // 组员录入的在招需求（按岗位一行）
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

    // 该组最近一份周计划 → (customerId:requirementId → 非空交付进展)
    const last = await prisma.workPlan.findFirst({
      where: { groupId },
      orderBy: { weekStart: 'desc' },
      select: { items: { select: { customerId: true, requirementId: true, progressNote: true } } },
    })
    const lastProgress: Record<string, string> = {}
    for (const it of last?.items ?? []) {
      if (it.customerId != null && it.requirementId != null && it.progressNote && it.progressNote.trim()) {
        lastProgress[`${it.customerId}:${it.requirementId}`] = it.progressNote
      }
    }

    return NextResponse.json({ groupName: group.name, members: group.members, requirements, lastProgress })
  } catch (e) {
    return handleApiError(e)
  }
}
