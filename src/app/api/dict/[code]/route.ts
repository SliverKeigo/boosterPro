import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 按字典 code 取启用中的字典项，供前端下拉使用：登录即可读（不限管理员）。
// 类型不存在时返回空数组 { data: [] }。
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const { code } = await params
    const type = await prisma.dictType.findUnique({
      where: { code },
      include: {
        items: {
          where: { enabled: true },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          select: { id: true, label: true, value: true, sort: true },
        },
      },
    })
    return NextResponse.json({ data: type?.items ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}
