import { NextResponse } from 'next/server'
import { HttpError, handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 轻量下拉选项：仅返回级联下拉所需字段（id / 岗位名 / 所属客户 / 招聘需求方），
// 任意登录用户均可取（**不要求 REQUIREMENT/VIEW 权限**）。
// 供候选人表单"招聘需求方 → 岗位"级联下拉使用。
export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    const data = await prisma.requirement.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, positionName: true, customerId: true, recruiter: true },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
