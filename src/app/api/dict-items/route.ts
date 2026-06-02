import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 某字典类型下的字典项列表（仅管理员）：?typeId=X，按 sort,id 升序
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const typeIdRaw = new URL(req.url).searchParams.get('typeId')
    const typeId = parseInt(typeIdRaw ?? '')
    if (!Number.isInteger(typeId) || typeId <= 0) throw new HttpError(400, '非法的字典类型 ID')
    const data = await prisma.dictItem.findMany({
      where: { typeId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true, typeId: true, label: true, value: true, sort: true, enabled: true },
    })
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新建字典项（仅管理员）：label / value 非空，typeId 必须存在
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { typeId, label, value, sort, enabled } = body
    const tid = parseInt(typeId)
    if (!Number.isInteger(tid) || tid <= 0) throw new HttpError(400, '非法的字典类型 ID')
    if (typeof label !== 'string' || !label.trim()) throw new HttpError(400, '字典项名称不能为空')
    if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, '字典项值不能为空')
    const type = await prisma.dictType.findUnique({ where: { id: tid }, select: { id: true } })
    if (!type) throw new HttpError(404, '字典类型不存在')
    const item = await prisma.dictItem.create({
      data: {
        typeId: tid,
        label,
        value,
        sort: Number.isInteger(sort) ? sort : 0,
        enabled: typeof enabled === 'boolean' ? enabled : true,
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
