import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 字典类型列表（需 SYS_DICT.VIEW）：含字典项数量，按 code 升序
export async function GET() {
  try {
    await requirePermission('SYS_DICT', 'VIEW')
    const data = await prisma.dictType.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

// 新建字典类型（需 SYS_DICT.CREATE）：code / name 非空
export async function POST(req: Request) {
  try {
    await requirePermission('SYS_DICT', 'CREATE')
    const body = await req.json()
    const { code, name, remark } = body
    if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, '字典编码不能为空')
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, '字典名称不能为空')
    const item = await prisma.dictType.create({
      data: { code, name, remark },
      include: { _count: { select: { items: true } } },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
