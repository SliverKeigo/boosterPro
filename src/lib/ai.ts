/* eslint-disable @typescript-eslint/no-explicit-any */
import { openai, MODEL } from '@/lib/openai'
import { HttpError } from '@/lib/apiError'

/** 从 AI 返回文本中容错解析 JSON（兼容裸 JSON / ```json``` 围栏 / 文本中夹带的 JSON） */
export function parseAiJson(text: string): any {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    /* continue */
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {
      /* continue */
    }
  }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) {
    try {
      return JSON.parse(brace[0])
    } catch {
      /* continue */
    }
  }
  return null
}

/**
 * 统一封装：通过 OpenAI Responses API + `web_search` 工具联网，取 output_text 并容错解析为 JSON。
 * 解析失败抛出 HttpError(502, 'AI 返回解析失败')（语义为上游返回异常，而非自身 500）。
 * 联网工具正式名是 `web_search`（GA），不是 `web_search_preview`。
 */
export async function runWebSearchJson(input: string): Promise<any> {
  const r = await (openai as any).responses.create({
    model: MODEL,
    tools: [{ type: 'web_search' }],
    input,
  })
  const text = r.output_text || ''
  const data = parseAiJson(text)
  if (!data) throw new HttpError(502, 'AI 返回解析失败')
  return data
}
