import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { SUPPLEMENT_INCLUDE, buildSupplementData } from '@/lib/supplementData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('CLIENT_SUPPLEMENT', 'VIEW')
    const data = await prisma.clientSupplement.findMany({
      orderBy: { createdAt: 'desc' },
      include: SUPPLEMENT_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('CLIENT_SUPPLEMENT', 'CREATE')
    const body = await req.json()
    const data = buildSupplementData(body, 'create')
    data.createdById = user.id
    const item = await prisma.clientSupplement.create({
      data,
      include: SUPPLEMENT_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
