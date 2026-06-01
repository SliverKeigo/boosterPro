/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { openai, MODEL } from '@/lib/openai'
import { parseAiJson } from '@/lib/ai'

// 输入公司名称，联网搜索后返回用于【自动填充客户档案已有字段】的结构化数据
export async function POST(req: Request) {
  try {
    const { companyName } = await req.json()
    if (!companyName || !String(companyName).trim()) {
      return NextResponse.json({ error: '请先填写公司名称' }, { status: 400 })
    }

    const r = await (openai as any).responses.create({
      model: MODEL,
      tools: [{ type: 'web_search' }],
      input:
        `请联网搜索「${companyName}」的最新公开信息，提取用于自动填充客户档案的字段。\n` +
        '对标企业务必是【当前真实存在】的竞品（排除已倒闭 / 已被收购 / 已退出市场的）。\n\n' +
        '严格只返回 JSON（不要多余文字、不要 markdown 围栏、不要引用角标）：\n' +
        '{"industry":"所属行业","region":"总部所在城市或地区","formerName":"公司曾用名（无则空字符串）","companyCulture":"企业文化与福利简述(150字内)","benchmarkCompanies":"对标竞品公司，多个用顿号分隔"}',
    })

    const text = r.output_text || ''
    const data = parseAiJson(text)
    if (!data) {
      return NextResponse.json({ error: 'AI 返回解析失败', raw: String(text).slice(0, 500) }, { status: 502 })
    }
    return NextResponse.json({
      industry: data.industry || '',
      region: data.region || '',
      formerName: data.formerName || '',
      companyCulture: data.companyCulture || '',
      benchmarkCompanies: Array.isArray(data.benchmarkCompanies)
        ? data.benchmarkCompanies.join('、')
        : data.benchmarkCompanies || '',
    })
  } catch (e) {
    console.error('AI company-info error', e)
    const msg = e instanceof Error ? e.message : '未知错误'
    return NextResponse.json({ error: 'AI 生成失败：' + msg }, { status: 500 })
  }
}
