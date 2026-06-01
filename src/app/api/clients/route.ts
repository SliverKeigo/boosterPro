import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CUSTOMER_INCLUDE, buildCustomerData } from '@/lib/clientData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const data = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: CUSTOMER_INCLUDE,
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const item = await prisma.customer.create({
      data: buildCustomerData(body, 'create'),
      include: CUSTOMER_INCLUDE,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
