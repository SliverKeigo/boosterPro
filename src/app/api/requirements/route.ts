import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { REQUIREMENT_INCLUDE, buildRequirementData } from '@/lib/requirementData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('REQUIREMENT', 'VIEW')
    const data = await prisma.requirement.findMany({
      orderBy: { updatedAt: 'desc' },
      include: REQUIREMENT_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('REQUIREMENT', 'CREATE')
    const body = await req.json()
    const data = buildRequirementData(body, 'create')
    data.createdById = user.id
    const item = await prisma.requirement.create({
      data,
      include: REQUIREMENT_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
