import { NextResponse } from 'next/server'
import { HttpError, handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 轻量下拉选项：仅返回 id + 名称（含部门名），任意登录用户均可取（不卡权限）。
// 供工作计划等表单的"选择组"下拉使用。
export async function GET(req: Request) {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const data = await prisma.group.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, department: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
