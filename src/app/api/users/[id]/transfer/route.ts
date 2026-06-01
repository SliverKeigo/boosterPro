import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 移交权限：把某用户名下八张业务表的数据归属批量改给另一用户（仅管理员）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentUser()
    if (!admin || !admin.isAdmin) throw new HttpError(403, '仅管理员可管理权限')

    const { id } = await params
    const fromId = parseInt(id)
    const body = await req.json()
    const toId = Number(body.toUserId)
    if (!toId) throw new HttpError(400, '缺少目标用户 toUserId')
    if (fromId === toId) throw new HttpError(400, '移交的源用户与目标用户不能相同')

    const [
      candidate,
      requirement,
      clientSupplement,
      talentPool,
      opportunity,
      customer,
      contract,
      knowledgeBase,
    ] = await prisma.$transaction([
      prisma.candidate.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.requirement.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.clientSupplement.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.talentPool.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.opportunity.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.customer.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.contract.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
      prisma.knowledgeBase.updateMany({ where: { createdById: fromId }, data: { createdById: toId } }),
    ])

    return NextResponse.json({
      success: true,
      moved: {
        candidate: candidate.count,
        requirement: requirement.count,
        clientSupplement: clientSupplement.count,
        talentPool: talentPool.count,
        opportunity: opportunity.count,
        customer: customer.count,
        contract: contract.count,
        knowledgeBase: knowledgeBase.count,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
