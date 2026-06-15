import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { WORK_PLAN_INCLUDE, buildItemCreate } from '@/lib/workPlanData'

/* eslint-disable @typescript-eslint/no-explicit-any */

// 列表：有 WORK_PLAN:VIEW 即看全部（工作计划是全公司一周一条，不按部门/组过滤）。
// 返回全量，前端 BoostTable 负责搜索/排序/分页。
export async function GET() {
  try {
    await requirePermission('WORK_PLAN', 'VIEW')
    const data = await prisma.workPlan.findMany({
      orderBy: [{ weekStart: 'desc' }, { id: 'desc' }],
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新增周计划：有 WORK_PLAN:CREATE 即可。一周一条（weekStart 唯一，冲突 409）。
// 嵌套写 items（每行带 groupId 来源组）+ 每行 assignments（JSON 日期数组）。
export async function POST(req: Request) {
  try {
    const user = await requirePermission('WORK_PLAN', 'CREATE')
    const body = await req.json()
    if (!body.weekStart || !body.weekEnd) throw new HttpError(400, '请选择本周起止日期')
    const weekStart = new Date(body.weekStart)
    const dup = await prisma.workPlan.findUnique({ where: { weekStart }, select: { id: true } })
    if (dup) throw new HttpError(409, '该周已存在工作计划，请勿重复创建')
    const items: any[] = Array.isArray(body.items) ? body.items : []
    const created = await prisma.workPlan.create({
      data: {
        weekStart,
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
