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

// 列表：支持 ?resource=KEY 过滤，返回 { data }（含成员）
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const resource = new URL(req.url).searchParams.get('resource')
    const data = await prisma.permissionGroup.findMany({
      where: resource ? { resource } : undefined,
      include: { members: true },
      orderBy: { id: 'desc' },
    })
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新建权限组：applyToAll=true 时 members 可为空数组
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { name, resource, actions = [], applyToAll = false, members = [] } = body
    const item = await prisma.permissionGroup.create({
      data: {
        name,
        resource,
        actions,
        applyToAll,
        members: {
          create: (members as any[]).map((m) => ({
            memberType: m.memberType,
            memberId: Number(m.memberId),
          })),
        },
      },
      include: { members: true },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
