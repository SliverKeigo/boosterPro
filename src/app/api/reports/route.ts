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
      // 报表仅消费这些非敏感字段；显式 select 杜绝 phone/email/birthYear/
      // salaryPlan/offerFileUrl/backgroundCheckReportUrl 等 PII 越权外泄。
      prisma.candidate.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          recommendationStatus: true,
          recommendationTime: true, // 明细「推荐日期」+ 本月推荐/有效简历统计
          recruitmentChannel: true, // 推荐渠道筛选
          createdAt: true,
          submitterId: true, // 推荐人筛选（前端按 submitterId 过滤 + 判「个人」）
          customerId: true, // 客户筛选
          // 报表按 customer.shortName / submitter.name 聚合、按 requirement.positionName 出明细
          customer: { select: { id: true, shortName: true } },
          submitter: { select: { id: true, name: true } },
          requirement: { select: { id: true, positionName: true } },
        },
      }),
      // 同理：需求仅取报表用到的非敏感字段
      prisma.requirement.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          // 报表按 customer.shortName 聚合
          customer: { select: { id: true, shortName: true } },
        },
      }),
    ])
    return NextResponse.json({ candidates, requirements })
  } catch (e) {
    return handleApiError(e)
  }
}
