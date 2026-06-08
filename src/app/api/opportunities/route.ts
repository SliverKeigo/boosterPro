import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, buildRowFilter } from '@/lib/permissions'
import { OPPORTUNITY_INCLUDE, buildOpportunityData } from '@/lib/opportunityData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const user = await requirePermission('OPPORTUNITY', 'VIEW')
    const data = await prisma.opportunity.findMany({
      where: await buildRowFilter(user, 'OPPORTUNITY', 'view'),
      orderBy: { updatedAt: 'desc' },
      include: OPPORTUNITY_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('OPPORTUNITY', 'CREATE')
    const body = await req.json()
    const data = buildOpportunityData(body, 'create')
    data.createdById = user.id
    const item = await prisma.opportunity.create({
      data,
      include: OPPORTUNITY_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
