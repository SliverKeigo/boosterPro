import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { SUPPLEMENT_INCLUDE, buildSupplementData } from '@/lib/supplementData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
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
    const body = await req.json()
    const item = await prisma.clientSupplement.create({
      data: buildSupplementData(body, 'create'),
      include: SUPPLEMENT_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
