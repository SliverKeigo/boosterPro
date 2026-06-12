import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requirePermission, getSessionPayload } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页。
// 读 cookie 做登录校验同时让本路由转为动态渲染，避免 Next 静态缓存返回过时部门列表。
export async function GET(req: Request) {
  try {
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // 可搜索下拉：带 ?q= 时按部门名模糊过滤
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const data = await prisma.department.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } }, hiddenRulesAsSource: { select: { resource: true, hiddenFromDeptId: true } } },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requirePermission('SYS_DEPARTMENT', 'CREATE')
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
