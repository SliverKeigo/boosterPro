import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin, getSessionPayload } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { RESOURCE_KEYS, type ResourceKey } from '@/lib/resources'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const department = await prisma.department.findUnique({
      where: { id: pid },
      include: { _count: { select: { users: true } }, hiddenResources: { select: { resource: true } } },
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
    const { name, hiddenResources } = body
    if (!name) return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    const department = await prisma.$transaction(async (tx) => {
      await tx.department.update({ where: { id: pid }, data: { name } })
      // hiddenResources：该部门「关闭对外可见」的模块 keys；传了数组就整体重写其黑名单
      if (Array.isArray(hiddenResources)) {
        await tx.departmentHiddenResource.deleteMany({ where: { departmentId: pid } })
        const valid = [...new Set(hiddenResources)].filter(
          (r): r is ResourceKey => typeof r === 'string' && RESOURCE_KEYS.includes(r as ResourceKey),
        )
        if (valid.length) {
          await tx.departmentHiddenResource.createMany({
            data: valid.map((resource) => ({ departmentId: pid, resource })),
            skipDuplicates: true,
          })
        }
      }
      return tx.department.findUnique({
        where: { id: pid },
        include: { _count: { select: { users: true } }, hiddenResources: { select: { resource: true } } },
      })
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
