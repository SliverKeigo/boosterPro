import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 更新字典类型（需 SYS_DICT.EDIT）：code / name 非空
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_DICT', 'EDIT')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const body = await req.json()
    const { code, name, remark } = body
    if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, '字典编码不能为空')
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, '字典名称不能为空')
    const item = await prisma.dictType.update({
      where: { id: pid },
      data: { code, name, remark },
      include: { _count: { select: { items: true } } },
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

// 删除字典类型（需 SYS_DICT.DELETE，字典项已配置级联删除）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('SYS_DICT', 'DELETE')
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    await prisma.dictType.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
