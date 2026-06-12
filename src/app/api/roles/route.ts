import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission, getCurrentUser } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页
// GET 登录即可：用户管理页配角色的下拉依赖角色名单（低敏），不卡 SYS_ROLE 权限
export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    const data = await prisma.role.findMany({
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
    await requirePermission('SYS_ROLE', 'CREATE')
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
