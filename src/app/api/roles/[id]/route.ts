import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission, getCurrentUser } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// GET 登录即可（与列表 GET 同口径：角色名单低敏，下拉依赖）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const role = await prisma.role.findUnique({
      where: { id: pid },
      include: { _count: { select: { users: true } } },
    })
    if (!role) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(role)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_ROLE', 'EDIT')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const body = await req.json()
    const { name, description } = body
    if (!name) return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 })
    const role = await prisma.role.update({
      where: { id: pid },
      data: { name, description },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(role)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_ROLE', 'DELETE')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const count = await prisma.user.count({ where: { roleId: pid } })
    if (count > 0) return NextResponse.json({ error: '该角色下有用户，无法删除' }, { status: 400 })
    await prisma.role.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
