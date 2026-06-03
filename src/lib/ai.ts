/* eslint-disable @typescript-eslint/no-explicit-any */
import { getOpenAI, MODEL } from '@/lib/openai'
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
  // 上游偶发以 SSE 流式返回（即便未请求 stream），SDK 解析时会抛错；
  // 这里显式非流式 + 最多重试 3 次，最终失败统一抛 502（上游异常语义，不污染成 500）。
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await (getOpenAI() as any).responses.create({
        model: MODEL,
        tools: [{ type: 'web_search' }],
        input,
        stream: false,
      })
      const data = parseAiJson(r.output_text || '')
      if (data) return data
      lastErr = new HttpError(502, 'AI 返回解析失败')
    } catch (e) {
      lastErr = e
    }
  }
  if (lastErr instanceof HttpError) throw lastErr
  throw new HttpError(502, 'AI 服务暂时不可用，请稍后重试')
}
