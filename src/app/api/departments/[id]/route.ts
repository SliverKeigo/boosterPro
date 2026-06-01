import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const department = await prisma.department.findUnique({
      where: { id: pid },
      include: { _count: { select: { users: true } } },
    })
    if (!department) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(department)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const body = await req.json()
    const { name } = body
    if (!name) return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    const department = await prisma.department.update({
      where: { id: pid },
      data: { name },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(department)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const count = await prisma.user.count({ where: { departmentId: pid } })
    if (count > 0) return NextResponse.json({ error: '该部门下有用户，无法删除' }, { status: 400 })
    await prisma.department.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
