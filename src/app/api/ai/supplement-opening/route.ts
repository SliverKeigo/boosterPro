/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { runWebSearchJson } from '@/lib/ai'
import { getPrompt } from '@/lib/aiPrompts'
import { HttpError, handleApiError } from '@/lib/apiError'
import { getCurrentUser, getPermissionMap } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

// 客户补充信息：用 AI 生成「开聊话术」（向候选人介绍/推荐该客户公司）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录')
    // 与「在客户补充表单内才显示 AI 按钮」一致：对 CLIENT_SUPPLEMENT 有 CREATE 或 EDIT
    const map = await getPermissionMap(user)
    const acts = map['CLIENT_SUPPLEMENT'] || []
    if (!user.isAdmin && !acts.includes('CREATE') && !acts.includes('EDIT')) {
      throw new HttpError(403, '无权使用该功能')
    }

    const { customerId, company, demand } = await req.json()
    // 客户名：优先 body.company；否则按 customerId 查库取全称/简称
    let companyName = String(company || '').trim()
    if (!companyName && customerId) {
      const c = await prisma.customer.findUnique({
        where: { id: Number(customerId) },
        select: { shortName: true, fullName: true },
      })
      companyName = c?.fullName || c?.shortName || ''
    }
    if (!companyName) return NextResponse.json({ error: '请先选择客户名称' }, { status: 400 })

    const prompt = await getPrompt('supplement_opening', { company: companyName, demand: String(demand || '（未提供）') })
    const data: any = await runWebSearchJson(prompt)
    const opening = typeof data?.opening === 'string' ? data.opening : typeof data === 'string' ? data : ''
    if (!opening) return NextResponse.json({ error: 'AI 返回解析失败' }, { status: 502 })
    return NextResponse.json({ opening })
  } catch (e) {
    if (e instanceof HttpError) return handleApiError(e)
    console.error('AI supplement-opening error', e)
    const msg = e instanceof Error ? e.message : '未知错误'
    return NextResponse.json({ error: 'AI 生成失败：' + msg }, { status: 500 })
  }
}
