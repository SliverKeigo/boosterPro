import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { CANDIDATE_INCLUDE, CANDIDATE_LIST_INCLUDE, buildCandidateData } from '@/lib/candidateData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('CANDIDATE', 'VIEW')
    const data = await prisma.candidate.findMany({
      orderBy: { updatedAt: 'desc' },
      include: CANDIDATE_LIST_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('CANDIDATE', 'CREATE')
    const body = await req.json()
    const data = buildCandidateData(body, 'create')
    data.createdById = user.id
    const item = await prisma.candidate.create({
      data,
      include: CANDIDATE_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
