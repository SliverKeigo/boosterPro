import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const WORK_PLAN_INCLUDE = {
  owner: { select: { id: true, name: true } },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildData(body: any) {
  const { owner, _count, id, createdAt, updatedAt, ...rest } = body
  void owner
  void _count
  void id
  void createdAt
  void updatedAt
  const data: any = { ...rest }
  data.startDate = data.startDate ? new Date(data.startDate) : null
  data.endDate = data.endDate ? new Date(data.endDate) : null
  if (data.ownerId === '' || data.ownerId === undefined) data.ownerId = null
  else if (data.ownerId !== null) data.ownerId = Number(data.ownerId)
  return data
}

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requireAdmin()
    const data = await prisma.workPlan.findMany({
      orderBy: { createdAt: 'desc' },
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const item = await prisma.workPlan.create({
      data: buildData(body),
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
