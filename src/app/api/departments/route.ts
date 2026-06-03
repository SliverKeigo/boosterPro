import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requireAdmin, getSessionPayload } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页。
// 读 cookie 做登录校验同时让本路由转为动态渲染，避免 Next 静态缓存返回过时部门列表。
export async function GET() {
  try {
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const data = await prisma.department.findMany({
      orderBy: { createdAt: 'asc' },
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
    const { name } = body
    if (!name) return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    const department = await prisma.department.create({
      data: { name },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(department, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
