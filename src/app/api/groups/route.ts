import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requirePermission, getSessionPayload } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 组 = 部门下的小组（组挂部门之下）。建组 / 配成员 / 设组长需 SYS_GROUP 对应权限（admin 恒过）。
// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页。
export async function GET(req: Request) {
  try {
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // 可搜索下拉：带 ?q= 时按组名模糊过滤
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const data = await prisma.group.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true } },
        members: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requirePermission('SYS_GROUP', 'CREATE')
    const { name, departmentId, leaderId, memberIds } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: '组名称不能为空' }, { status: 400 })
    if (!departmentId) return NextResponse.json({ error: '请选择所属部门' }, { status: 400 })
    const ids: number[] = Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : []
    // 组长必须是本组成员（A2）
    if (leaderId && !ids.includes(Number(leaderId))) {
      return NextResponse.json({ error: '组长必须是该组成员' }, { status: 400 })
    }
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name: name.trim(),
          departmentId: Number(departmentId),
          leaderId: leaderId ? Number(leaderId) : null,
        },
      })
      // 设置成员：把所选用户的 groupId 指向本组（一人一组，A1）
      if (ids.length) await tx.user.updateMany({ where: { id: { in: ids } }, data: { groupId: g.id } })
      return g
    })
    return NextResponse.json(group, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
