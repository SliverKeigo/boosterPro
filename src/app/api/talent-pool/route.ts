import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, buildRowFilter } from '@/lib/permissions'
import { buildTalentPoolData } from '@/lib/talentPoolData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const user = await requirePermission('TALENT_POOL', 'VIEW')
    const data = await prisma.talentPool.findMany({
      where: await buildRowFilter(user, 'TALENT_POOL', 'view'),
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } } },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('TALENT_POOL', 'CREATE')
    const body = await req.json()
    const data = buildTalentPoolData(body)
    data.createdById = user.id
    const item = await prisma.talentPool.create({ data })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
