import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 撤销授权：仅授权操作人本人（grantedById===自己）或管理员可删除。
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const { id } = await params
    const grantId = parseInt(id)
    if (!Number.isInteger(grantId) || grantId <= 0) throw new HttpError(400, '非法的授权 ID')

    const existing = await prisma.dataGrant.findUnique({ where: { id: grantId } })
    if (!existing) throw new HttpError(404, '记录不存在或已被删除')
    if (!user.isAdmin && existing.grantedById !== user.id) {
      throw new HttpError(403, '只能撤销由本人发出的授权')
    }

    await prisma.dataGrant.delete({ where: { id: grantId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
