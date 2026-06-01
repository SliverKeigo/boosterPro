import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: true,
        role: true,
      },
    })
    if (!user) return NextResponse.json({ error: '未找到' }, { status: 404 })

    const { passwordHash, ...userWithoutPassword } = user
    return NextResponse.json(userWithoutPassword)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, email, password, departmentId, roleId } = body

    const updateData: any = {}
    if (name) updateData.name = name
    if (email) updateData.email = email
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10)
    if (departmentId !== undefined) updateData.departmentId = departmentId ? parseInt(departmentId) : null
    if (roleId !== undefined) updateData.roleId = roleId ? parseInt(roleId) : null

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        department: true,
        role: true,
      },
    })

    const { passwordHash, ...userWithoutPassword } = user
    return NextResponse.json(userWithoutPassword)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.user.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
