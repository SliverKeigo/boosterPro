import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/permissions'

// 数据报表专用接口：只要拥有 REPORT 的 VIEW 权限即可读取，
// 服务端聚合所需的候选人 / 需求数据不再受 CANDIDATE / REQUIREMENT 权限限制。
export async function GET() {
  try {
    await requirePermission('REPORT', 'VIEW')
    const [candidates, requirements] = await Promise.all([
      prisma.candidate.findMany({
        orderBy: { createdAt: 'desc' },
        // 报表按 customer.shortName / submitter.name 聚合，需带上对应关系
        include: {
          customer: { select: { id: true, shortName: true } },
          submitter: { select: { id: true, name: true } },
        },
      }),
      prisma.requirement.findMany({
        orderBy: { createdAt: 'desc' },
        // 报表按 customer.shortName 聚合
        include: { customer: { select: { id: true, shortName: true } } },
      }),
    ])
    return NextResponse.json({ candidates, requirements })
  } catch (e) {
    return handleApiError(e)
  }
}
