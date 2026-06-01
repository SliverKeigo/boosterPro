import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildTalentPoolData } from '@/lib/talentPoolData'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const data = await prisma.talentPool.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const item = await prisma.talentPool.create({ data: buildTalentPoolData(body) })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
