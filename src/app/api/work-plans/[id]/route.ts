import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { WORK_PLAN_INCLUDE, buildItemCreate } from '@/lib/workPlanData'

/* eslint-disable @typescript-eslint/no-explicit-any */

function pidOf(id: string): number {
  const pid = parseInt(id)
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
  return pid
}

// 读单个周计划：有 WORK_PLAN:VIEW 即可（看全部）。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('WORK_PLAN', 'VIEW')
    const pid = pidOf((await params).id)
    const plan = await prisma.workPlan.findUnique({ where: { id: pid }, include: WORK_PLAN_INCLUDE })
    if (!plan) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(plan)
  } catch (e) {
    return handleApiError(e)
  }
}

// 改：有 WORK_PLAN:EDIT 即可改整条（不限组、无行级归属）。items 全量重写（deleteMany → create，级联清旧 assignments）。
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('WORK_PLAN', 'EDIT')
    const pid = pidOf((await params).id)
    const existing = await prisma.workPlan.findUnique({ where: { id: pid }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: '未找到' }, { status: 404 })
    const body = await req.json()
    if (!body.weekStart || !body.weekEnd) throw new HttpError(400, '请选择本周起止日期')
    const weekStart = new Date(body.weekStart)
    // 一周一条：改到别的周时不能撞上已存在的另一条
    const dup = await prisma.workPlan.findUnique({ where: { weekStart }, select: { id: true } })
    if (dup && dup.id !== pid) throw new HttpError(409, '该周已存在工作计划，请勿重复创建')
    const items: any[] = Array.isArray(body.items) ? body.items : []
    const updated = await prisma.$transaction(async (tx) => {
      await tx.workPlanItem.deleteMany({ where: { workPlanId: pid } })
      return tx.workPlan.update({
        where: { id: pid },
        data: {
          weekStart,
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

// 删：有 WORK_PLAN:DELETE 即可。级联删 items / assignments。
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('WORK_PLAN', 'DELETE')
    const pid = pidOf((await params).id)
    const existing = await prisma.workPlan.findUnique({ where: { id: pid }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: '未找到' }, { status: 404 })
    await prisma.workPlan.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
