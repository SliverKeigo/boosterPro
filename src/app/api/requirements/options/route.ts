import { NextResponse } from 'next/server'
import { HttpError, handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 轻量下拉选项：仅返回级联下拉所需字段（id / 岗位名 / 所属客户 / 招聘需求方），
// 任意登录用户均可取（**不要求 REQUIREMENT/VIEW 权限**）。
// 供候选人表单"招聘需求方 → 岗位"级联下拉使用。
export async function GET(req: Request) {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    // 可搜索下拉：带 ?q= 时由后端按 岗位名 / 招聘需求方 模糊过滤；不带则返回全部
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const data = await prisma.requirement.findMany({
      where: q
        ? {
            OR: [
              { positionName: { contains: q, mode: 'insensitive' } },
              { recruiter: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, positionName: true, customerId: true, recruiter: true, status: true, createdAt: true },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
