import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { getCurrentUser } from '@/lib/permissions'
import { assertCanWriteWorkPlan, getMyGroupId } from '@/lib/groups'
import { prisma } from '@/lib/prisma'
import { WORK_PLAN_INCLUDE, buildItemCreate } from '@/lib/workPlanData'

/* eslint-disable @typescript-eslint/no-explicit-any */

// 列表：管理员看全部；其他人只看本组（组员只读本组、组长读写本组）。返回全量，前端 BoostTable 负责搜索/排序/分页。
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const where = user.isAdmin ? {} : { groupId: getMyGroupId(user) ?? -1 }
    const data = await prisma.workPlan.findMany({
      where,
      orderBy: [{ weekStart: 'desc' }, { id: 'desc' }],
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新增周计划：仅该组组长（或管理员）可建。嵌套写 items + 每行 assignments。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const body = await req.json()
    if (!body.groupId) return NextResponse.json({ error: '请选择所属组' }, { status: 400 })
    if (!body.weekStart || !body.weekEnd) return NextResponse.json({ error: '请选择本周起止日期' }, { status: 400 })
    await assertCanWriteWorkPlan(user, body.groupId)
    const items: any[] = Array.isArray(body.items) ? body.items : []
    const created = await prisma.workPlan.create({
      data: {
        groupId: Number(body.groupId),
        weekStart: new Date(body.weekStart),
        weekEnd: new Date(body.weekEnd),
        deliveryStrategy: body.deliveryStrategy || null,
        createdById: user.id,
        items: { create: items.map((it, i) => buildItemCreate(it, i)) },
      },
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
