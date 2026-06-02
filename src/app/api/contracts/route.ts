import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { CONTRACT_INCLUDE, buildContractData } from '@/lib/contractData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('CONTRACT', 'VIEW')
    const data = await prisma.contract.findMany({
      orderBy: { updatedAt: 'desc' },
      include: CONTRACT_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('CONTRACT', 'CREATE')
    const body = await req.json()
    const data = buildContractData(body, 'create')
    data.createdById = user.id
    const item = await prisma.contract.create({
      data,
      include: CONTRACT_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
