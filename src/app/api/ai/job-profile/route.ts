/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { runWebSearchJson } from '@/lib/ai'

// Serverless 平台下 AI 联网调用较慢，放宽函数执行上限
export const maxDuration = 60

// 输入岗位 JD，联网搜索该岗位最新技术栈/任职要求趋势后，分析「岗位简易画像」（不定数量条目）
export async function POST(req: Request) {
  try {
    const { jobDescription, positionName } = await req.json()
    if (!jobDescription || !String(jobDescription).trim()) {
      return NextResponse.json({ error: '请先填写岗位 JD' }, { status: 400 })
    }

    const data = await runWebSearchJson(
      `岗位名称：${positionName || '（未提供）'}\n岗位 JD：\n${jobDescription}\n\n` +
        '请先联网搜索该岗位当前（最近一年）的主流技术栈与任职要求趋势，确保提炼的技术与要求是【当下最新】的，不要使用已过时的技术。\n' +
        '然后结合 JD 分析「岗位简易画像」，从岗位知识、专业技能、管理能力、项目经验、行业经验、资质证书等各方面提炼要求。\n\n' +
        '严格只返回 JSON（不要多余文字、不要 markdown 围栏、不要引用角标）：\n' +
        '{"profiles":[{"category":"分类名称","description":"该方面的具体要求"}]}\n' +
        '条目数量与分类根据该 JD 的实际情况灵活确定（可能 3 条，也可能 6-8 条），不要固定数量。',
    )

    const profiles = Array.isArray(data?.profiles) ? data.profiles : []
    if (!profiles.length) {
      return NextResponse.json({ error: 'AI 返回解析失败' }, { status: 502 })
    }
    return NextResponse.json({
      profiles: profiles.map((p: any) => ({
        category: p.category || p.name || p.title || '',
        description: p.description || p.content || p.requirement || '',
      })),
    })
  } catch (e) {
    console.error('AI job-profile error', e)
    const msg = e instanceof Error ? e.message : '未知错误'
    return NextResponse.json({ error: 'AI 分析失败：' + msg }, { status: 500 })
  }
}
