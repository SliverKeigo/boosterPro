import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    const data = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
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
    const { name, description } = body
    if (!name) return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 })
    const role = await prisma.role.create({
      data: { name, description },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(role, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
