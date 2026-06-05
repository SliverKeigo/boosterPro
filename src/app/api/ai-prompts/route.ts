/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { PROMPT_DEFAULTS } from '@/lib/aiPrompts'

// 列出所有 AI 提示词 = 代码内置 key 合并库中覆盖值（库优先）。
export async function GET() {
  try {
    await requireAdmin()
    const rows = await prisma.aiPrompt.findMany({ orderBy: { key: 'asc' } })
    const byKey = new Map(rows.map((r) => [r.key, r]))
    const data: any[] = Object.entries(PROMPT_DEFAULTS).map(([key, def]) => {
      const row = byKey.get(key)
      return {
        id: row?.id ?? null,
        key,
        name: row?.name || def.name,
        content: row?.content || def.content,
        description: row?.description || def.description,
        overridden: !!row, // 是否已被库覆盖（否则用代码默认值）
        updatedAt: row?.updatedAt ?? null,
      }
    })
    // 库里若存在 PROMPT_DEFAULTS 之外的自定义 key，也带出
    for (const r of rows) {
      if (!PROMPT_DEFAULTS[r.key]) {
        data.push({ id: r.id, key: r.key, name: r.name, content: r.content, description: r.description, overridden: true, updatedAt: r.updatedAt })
      }
    }
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

// 按 key upsert：保存提示词覆盖值
export async function PUT(req: Request) {
  try {
    await requireAdmin()
    const { key, name, content, description } = await req.json()
    if (!key || !String(content || '').trim()) throw new HttpError(400, '提示词 key 与内容不能为空')
    const row = await prisma.aiPrompt.upsert({
      where: { key },
      create: { key, name: name || key, content, description: description || null },
      update: { name: name || key, content, description: description || null },
    })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e)
  }
}

// DELETE ?key=xxx：删除库覆盖 → 恢复代码内置默认
export async function DELETE(req: Request) {
  try {
    await requireAdmin()
    const key = new URL(req.url).searchParams.get('key')
    if (!key) throw new HttpError(400, '缺少 key')
    await prisma.aiPrompt.deleteMany({ where: { key } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
