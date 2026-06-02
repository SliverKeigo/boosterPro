import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'
import { CUSTOMER_INCLUDE, buildCustomerData } from '@/lib/clientData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requirePermission('CUSTOMER', 'VIEW')
    const data = await prisma.customer.findMany({
      orderBy: { updatedAt: 'desc' },
      include: CUSTOMER_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission('CUSTOMER', 'CREATE')
    const body = await req.json()
    const data = buildCustomerData(body, 'create')
    data.createdById = user.id
    const item = await prisma.customer.create({
      data,
      include: CUSTOMER_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
