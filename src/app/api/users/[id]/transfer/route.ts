/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 移交权限：把某用户名下九张业务表的数据归属批量改给另一用户（仅管理员）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentUser()
    if (!admin || !admin.isAdmin) throw new HttpError(403, '仅管理员可管理权限')

    const { id } = await params
    const fromId = parseInt(id)
    if (!Number.isInteger(fromId) || fromId <= 0) throw new HttpError(400, '非法的用户 ID')
    const body = await req.json()
    const toId = Number(body.toUserId)
    if (!toId) throw new HttpError(400, '缺少目标用户 toUserId')
    if (!Number.isInteger(toId) || toId <= 0) throw new HttpError(400, '非法的目标用户 ID')
    if (fromId === toId) throw new HttpError(400, '移交的源用户与目标用户不能相同')
    const targetUser = await prisma.user.findUnique({ where: { id: toId } })
    if (!targetUser) throw new HttpError(400, '目标用户不存在')
    const fromUser = await prisma.user.findUnique({ where: { id: fromId } })
    if (!fromUser) throw new HttpError(400, '源用户不存在')

    // 交互式事务：9 表归属批量改 + 同一事务内写一条审计日志（含各表条数、操作人、用户名快照）
    const moved = await prisma.$transaction(async (tx) => {
      const upd = (m: any) => m.updateMany({ where: { createdById: fromId }, data: { createdById: toId } })
      const [candidate, requirement, clientSupplement, customerContact, talentPool, opportunity, customer, contract, knowledgeBase] = await Promise.all([
        upd(tx.candidate), upd(tx.requirement), upd(tx.clientSupplement), upd(tx.customerContact),
        upd(tx.talentPool), upd(tx.opportunity), upd(tx.customer), upd(tx.contract), upd(tx.knowledgeBase),
      ])
      const counts = {
        candidate: candidate.count, requirement: requirement.count, clientSupplement: clientSupplement.count,
        customerContact: customerContact.count, talentPool: talentPool.count, opportunity: opportunity.count,
        customer: customer.count, contract: contract.count, knowledgeBase: knowledgeBase.count,
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      await tx.transferLog.create({
        data: {
          fromUserId: fromId, fromUserName: fromUser.name,
          toUserId: toId, toUserName: targetUser.name,
          operatorId: admin.id, operatorName: admin.name,
          moved: counts, totalCount: total,
        },
      })
      return counts
    })

    return NextResponse.json({ success: true, moved })
  } catch (e) {
    return handleApiError(e)
  }
}
