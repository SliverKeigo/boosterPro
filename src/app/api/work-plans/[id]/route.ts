import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { getCurrentUser } from '@/lib/permissions'
import { assertCanWriteWorkPlan, getMyGroupId } from '@/lib/groups'
import { prisma } from '@/lib/prisma'
import { WORK_PLAN_INCLUDE, buildItemCreate } from '@/lib/workPlanData'

/* eslint-disable @typescript-eslint/no-explicit-any */

function pidOf(id: string): number {
  const pid = parseInt(id)
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
  return pid
}

// 读单个周计划：管理员或本组成员可读
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const pid = pidOf((await params).id)
    const plan = await prisma.workPlan.findUnique({ where: { id: pid }, include: WORK_PLAN_INCLUDE })
    if (!plan) return NextResponse.json({ error: '未找到' }, { status: 404 })
    if (!user.isAdmin && plan.groupId !== getMyGroupId(user)) {
      throw new HttpError(403, '无权查看其它组的工作计划')
    }
    return NextResponse.json(plan)
  } catch (e) {
    return handleApiError(e)
  }
}

// 改：仅该组组长（或管理员）。items 全量重写（deleteMany → create，级联清旧 assignments）。
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const pid = pidOf((await params).id)
    const existing = await prisma.workPlan.findUnique({ where: { id: pid }, select: { groupId: true } })
    if (!existing) return NextResponse.json({ error: '未找到' }, { status: 404 })
    await assertCanWriteWorkPlan(user, existing.groupId) // 守卫原组
    const body = await req.json()
    // 管理员可改组；改组时也要对新组有权限（组长不改组）
    const newGroupId = body.groupId ? Number(body.groupId) : existing.groupId
    if (newGroupId !== existing.groupId) await assertCanWriteWorkPlan(user, newGroupId)
    if (!body.weekStart || !body.weekEnd) return NextResponse.json({ error: '请选择本周起止日期' }, { status: 400 })
    const items: any[] = Array.isArray(body.items) ? body.items : []
    const updated = await prisma.$transaction(async (tx) => {
      await tx.workPlanItem.deleteMany({ where: { workPlanId: pid } })
      return tx.workPlan.update({
        where: { id: pid },
        data: {
          groupId: newGroupId,
          weekStart: new Date(body.weekStart),
          weekEnd: new Date(body.weekEnd),
          deliveryStrategy: body.deliveryStrategy || null,
          items: { create: items.map((it, i) => buildItemCreate(it, i)) },
        },
        include: WORK_PLAN_INCLUDE,
      })
    })
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e)
  }
}

// 删：仅该组组长（或管理员）。级联删 items / assignments。
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const pid = pidOf((await params).id)
    const existing = await prisma.workPlan.findUnique({ where: { id: pid }, select: { groupId: true } })
    if (!existing) return NextResponse.json({ error: '未找到' }, { status: 404 })
    await assertCanWriteWorkPlan(user, existing.groupId)
    await prisma.workPlan.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
