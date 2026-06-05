import { NextResponse } from 'next/server'
import { runWebSearchJson } from '@/lib/ai'
import { getPrompt } from '@/lib/aiPrompts'
import { HttpError, handleApiError } from '@/lib/apiError'
import { getCurrentUser, getPermissionMap } from '@/lib/permissions'

// Serverless 平台下 AI 联网调用较慢，放宽函数执行上限
export const maxDuration = 60

// 输入公司名称，联网搜索后返回用于【自动填充客户档案已有字段】的结构化数据
export async function POST(req: Request) {
  try {
    // 资源功能权限：与「在新增/编辑客户表单内才显示 AI 按钮」一致，要求对 CUSTOMER 有 CREATE 或 EDIT
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录')
    const map = await getPermissionMap(user)
    const acts = map['CUSTOMER'] || []
    if (!user.isAdmin && !acts.includes('CREATE') && !acts.includes('EDIT')) {
      throw new HttpError(403, '无权使用该功能')
    }

    const { companyName } = await req.json()
    if (!companyName || !String(companyName).trim()) {
      return NextResponse.json({ error: '请先填写公司名称' }, { status: 400 })
    }

    // 提示词从库读取（管理员可在「提示词管理」改），缺失则回退代码内置默认值
    const prompt = await getPrompt('company_info', { companyName: String(companyName) })
    const data = await runWebSearchJson(prompt)

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
    // HttpError（如 AI 解析失败 502）透传其状态码；其余视为调用失败，保留友好前缀
    if (e instanceof HttpError) return handleApiError(e)
    console.error('AI company-info error', e)
    const msg = e instanceof Error ? e.message : '未知错误'
    return NextResponse.json({ error: 'AI 生成失败：' + msg }, { status: 500 })
  }
}
