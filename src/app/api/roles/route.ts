import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
export async function GET() {
  try {
    await requireAdmin()
    const data = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { name, description } = body
    if (!name) return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 })
    const role = await prisma.role.create({
      data: { name, description },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(role, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
