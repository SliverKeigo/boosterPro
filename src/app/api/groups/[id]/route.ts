import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin, getSessionPayload } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

function pidOf(id: string): number {
  const pid = parseInt(id)
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
  return pid
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const pid = pidOf((await params).id)
    const group = await prisma.group.findUnique({
      where: { id: pid },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true } },
        members: { select: { id: true, name: true } },
      },
    })
    if (!group) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(group)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const pid = pidOf((await params).id)
    const { name, departmentId, leaderId, memberIds } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: '组名称不能为空' }, { status: 400 })
    if (!departmentId) return NextResponse.json({ error: '请选择所属部门' }, { status: 400 })
    const ids: number[] = Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : []
    if (leaderId && !ids.includes(Number(leaderId))) {
      return NextResponse.json({ error: '组长必须是该组成员' }, { status: 400 })
    }
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.update({
        where: { id: pid },
        data: {
          name: name.trim(),
          departmentId: Number(departmentId),
          leaderId: leaderId ? Number(leaderId) : null,
        },
      })
      // 同步成员：原属本组但这次未选中的移出（groupId=null）；选中的设为本组
      await tx.user.updateMany({
        where: { groupId: pid, id: { notIn: ids.length ? ids : [0] } },
        data: { groupId: null },
      })
      if (ids.length) await tx.user.updateMany({ where: { id: { in: ids } }, data: { groupId: pid } })
      return g
    })
    return NextResponse.json(group)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const pid = pidOf((await params).id)
    await prisma.$transaction(async (tx) => {
      // 先解绑成员，再删组（避免外键约束）
      await tx.user.updateMany({ where: { groupId: pid }, data: { groupId: null } })
      await tx.group.delete({ where: { id: pid } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
