import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { KNOWLEDGE_INCLUDE, buildKnowledgeData } from '@/lib/knowledgeData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('KNOWLEDGE', 'VIEW')
    const data = await prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: 'desc' },
      include: KNOWLEDGE_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('KNOWLEDGE', 'CREATE')
    const body = await req.json()
    const data = buildKnowledgeData(body, 'create')
    data.createdById = user.id
    const item = await prisma.knowledgeBase.create({
      data,
      include: KNOWLEDGE_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
