import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { handleApiError, HttpError } from '@/lib/apiError'
import { getCurrentUser, requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// 分级返回（避免信息泄露）：管理员拿全量字段（不含 passwordHash），普通登录用户仅 { id, name }。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 })

    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')

    if (me.isAdmin) {
      const user = await prisma.user.findUnique({
        where: { id: pid },
        omit: { passwordHash: true },
        include: {
          department: true,
          role: true,
        },
      })
      if (!user) return NextResponse.json({ error: '未找到' }, { status: 404 })

      return NextResponse.json(user)
    }

    const user = await prisma.user.findUnique({
      where: { id: pid },
      select: { id: true, name: true },
    })
    if (!user) return NextResponse.json({ error: '未找到' }, { status: 404 })

    return NextResponse.json(user)
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
    const { name, username, email, password, departmentId, roleId } = body

    const updateData: Prisma.UserUncheckedUpdateInput = {}
    if (name) updateData.name = name
    if (username) updateData.username = username
    if (email !== undefined) updateData.email = email || null
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10)
    if (departmentId !== undefined) updateData.departmentId = departmentId ? parseInt(departmentId) : null
    if (roleId !== undefined) updateData.roleId = roleId ? parseInt(roleId) : null

    const user = await prisma.user.update({
      where: { id: pid },
      data: updateData,
      omit: { passwordHash: true },
      include: {
        department: true,
        role: true,
      },
    })

    return NextResponse.json(user)
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
    await prisma.user.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
