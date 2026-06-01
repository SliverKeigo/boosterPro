/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 仅管理员可管理权限：未登录或非 admin 一律 403
async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) throw new HttpError(403, '仅管理员可管理权限')
  return user
}

// 更新权限组：name/resource/actions/applyToAll，members 整体重建
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const { name, resource, actions = [], applyToAll = false, members = [] } = body
    const item = await prisma.permissionGroup.update({
      where: { id: parseInt(id) },
      data: {
        name,
        resource,
        actions,
        applyToAll,
        members: {
          deleteMany: {},
          create: (members as any[]).map((m) => ({
            memberType: m.memberType,
            memberId: Number(m.memberId),
          })),
        },
      },
      include: { members: true },
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

// 删除权限组（members 已配置级联删除）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    await prisma.permissionGroup.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
