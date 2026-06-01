import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const department = await prisma.department.findUnique({
      where: { id: parseInt(id) },
      include: { _count: { select: { users: true } } },
    })
    if (!department) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(department)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name } = body
    if (!name) return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: { name },
      include: { _count: { select: { users: true } } },
    })
    return NextResponse.json(department)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const count = await prisma.user.count({ where: { departmentId: parseInt(id) } })
    if (count > 0) return NextResponse.json({ error: '该部门下有用户，无法删除' }, { status: 400 })
    await prisma.department.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
