import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission, getSessionPayload } from '@/lib/permissions'
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
      include: { _count: { select: { users: true } }, hiddenRulesAsSource: { select: { resource: true, hiddenFromDeptId: true } } },
    })
    if (!department) return NextResponse.json({ error: '未找到' }, { status: 404 })
    return NextResponse.json(department)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_DEPARTMENT', 'EDIT')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const body = await req.json()
    const { name, blocks } = body
    if (!name) return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    const department = await prisma.$transaction(async (tx) => {
      await tx.department.update({ where: { id: pid }, data: { name } })
      // blocks：本部门(源)对各目标部门「定向隐藏」的 (模块, 目标部门) 组合；传了数组就整体重写本部门的黑名单
      if (Array.isArray(blocks)) {
        await tx.departmentHiddenResource.deleteMany({ where: { departmentId: pid } })
        // 过滤：resource 必须合法；hiddenFromDeptId 必须是正整数且不等于本部门
        const seen = new Set<string>()
        const valid = blocks
          .filter(
            (b): b is { resource: ResourceKey; hiddenFromDeptId: number } =>
              !!b &&
              typeof b.resource === 'string' &&
              RESOURCE_KEYS.includes(b.resource as ResourceKey) &&
              Number.isInteger(b.hiddenFromDeptId) &&
              b.hiddenFromDeptId > 0 &&
              b.hiddenFromDeptId !== pid,
          )
          .filter((b) => {
            const k = `${b.resource}:${b.hiddenFromDeptId}`
            if (seen.has(k)) return false
            seen.add(k)
            return true
          })
        if (valid.length) {
          await tx.departmentHiddenResource.createMany({
            data: valid.map((b) => ({ departmentId: pid, resource: b.resource, hiddenFromDeptId: b.hiddenFromDeptId })),
            skipDuplicates: true,
          })
        }
      }
      return tx.department.findUnique({
        where: { id: pid },
        include: { _count: { select: { users: true } }, hiddenRulesAsSource: { select: { resource: true, hiddenFromDeptId: true } } },
      })
    })
    return NextResponse.json(department)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_DEPARTMENT', 'DELETE')
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
