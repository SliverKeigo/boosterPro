import { NextResponse } from 'next/server'
import { HttpError, handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/permissions'

// 轻量下拉选项：仅返回 id + 名称，任意登录用户均可取（**不要求 CUSTOMER/VIEW 权限**）。
// 供候选人 / 客户补充信息 / 合同 / 客户需求等表单的"选择客户"下拉使用——
// 这些表单只需要"引用"客户（拿到 id 与名称），不应被"客户列表查看权限"卡住。
export async function GET(req: Request) {
  try {
    const me = await getCurrentUser()
    if (!me) throw new HttpError(401, '未登录或登录已过期')
    // 可搜索下拉：带 ?q= 时由后端按 简称 / 全称 模糊过滤(不区分大小写)；不带则返回全部
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const data = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { shortName: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, shortName: true, fullName: true },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
