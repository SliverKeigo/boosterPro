import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, buildRowFilter } from '@/lib/permissions'
import { CANDIDATE_INCLUDE, CANDIDATE_LIST_INCLUDE, buildCandidateData, assertCandidateUnique } from '@/lib/candidateData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const user = await requirePermission('CANDIDATE', 'VIEW')
    const data = await prisma.candidate.findMany({
      where: await buildRowFilter(user, 'CANDIDATE', 'view'),
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
    await assertCandidateUnique(data)
    data.createdById = user.id
    // 提交人 / 提交人部门未显式指定时，默认归当前登录用户
    // （与前端预填一致，并作为非 UI 调用 / 字段被清空时的兜底）
    if (data.submitterId == null) data.submitterId = user.id
    if (data.submitDepartmentId == null) data.submitDepartmentId = user.departmentId ?? null
    const item = await prisma.candidate.create({
      data,
      include: CANDIDATE_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
