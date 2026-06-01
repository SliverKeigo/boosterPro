import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const role = await prisma.role.findUnique({
      where: { id: parseInt(id) },
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
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const { name, description } = body
    if (!name) return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 })
    const role = await prisma.role.update({
      where: { id: parseInt(id) },
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
    await requireAdmin()
    const { id } = await params
    const count = await prisma.user.count({ where: { roleId: parseInt(id) } })
    if (count > 0) return NextResponse.json({ error: '该角色下有用户，无法删除' }, { status: 400 })
    await prisma.role.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
