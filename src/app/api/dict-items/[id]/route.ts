import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 更新字典项（仅管理员）：label / value 非空
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    const body = await req.json()
    const { label, value, sort, enabled } = body
    if (typeof label !== 'string' || !label.trim()) throw new HttpError(400, '字典项名称不能为空')
    if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, '字典项值不能为空')
    const item = await prisma.dictItem.update({
      where: { id: pid },
      data: {
        label,
        value,
        ...(Number.isInteger(sort) ? { sort } : {}),
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
      },
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

// 删除字典项（仅管理员）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const pid = parseInt(id)
    if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, '非法的 ID')
    await prisma.dictItem.delete({ where: { id: pid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
