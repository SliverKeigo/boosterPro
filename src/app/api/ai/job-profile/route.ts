/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { runWebSearchJson } from '@/lib/ai'
import { getPrompt } from '@/lib/aiPrompts'
import { HttpError, handleApiError } from '@/lib/apiError'
import { getCurrentUser, getPermissionMap } from '@/lib/permissions'

// Serverless 平台下 AI 联网调用较慢，放宽函数执行上限
export const maxDuration = 60

// 输入岗位 JD，联网搜索该岗位最新技术栈/任职要求趋势后，分析「岗位简易画像」（不定数量条目）
export async function POST(req: Request) {
  try {
    // 资源功能权限：与「在新增/编辑需求表单内才显示 AI 按钮」一致，要求对 REQUIREMENT 有 CREATE 或 EDIT
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录')
    const map = await getPermissionMap(user)
    const acts = map['REQUIREMENT'] || []
    if (!user.isAdmin && !acts.includes('CREATE') && !acts.includes('EDIT')) {
      throw new HttpError(403, '无权使用该功能')
    }

    const { jobDescription, positionName } = await req.json()
    if (!jobDescription || !String(jobDescription).trim()) {
      return NextResponse.json({ error: '请先填写岗位 JD' }, { status: 400 })
    }

    // 提示词从库读取（管理员可在「提示词管理」改），缺失则回退代码内置默认值
    const prompt = await getPrompt('job_profile', { positionName: positionName || '（未提供）', jobDescription: String(jobDescription) })
    const data = await runWebSearchJson(prompt)

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
    // HttpError（如 AI 解析失败 502）透传其状态码；其余视为调用失败，保留友好前缀
    if (e instanceof HttpError) return handleApiError(e)
    console.error('AI job-profile error', e)
    const msg = e instanceof Error ? e.message : '未知错误'
    return NextResponse.json({ error: 'AI 分析失败：' + msg }, { status: 500 })
  }
}
