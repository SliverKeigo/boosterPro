/* eslint-disable @typescript-eslint/no-explicit-any */
import { getOpenAI, MODEL } from '@/lib/openai'
import { getAnthropic } from '@/lib/anthropic'
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
 * 从 Responses API 返回里取纯文本：优先 SDK 聚合好的 `output_text`；
 * 没有则兜底遍历 `output[].content[].text`。不同服务商/SDK 版本对 `output_text` 的填充未必一致
 * （豆包火山方舟 Ark 的 Responses API 与 OpenAI 同形但实现不同），兜底保证两侧都能取到文本。
 */
function extractOutputText(r: any): string {
  if (typeof r?.output_text === 'string' && r.output_text.trim()) return r.output_text
  const out = r?.output
  if (Array.isArray(out)) {
    const parts: string[] = []
    for (const item of out) {
      const content = item?.content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        const t = typeof c?.text === 'string' ? c.text : c?.text?.value
        if (typeof t === 'string') parts.push(t)
      }
    }
    if (parts.length) return parts.join('')
  }
  return ''
}

/**
 * 从 Anthropic Messages 返回里取纯文本：拼接所有 `text` 内容块，
 * 忽略 `web_search_tool_result` / `thinking` 等非文本块。用于 DeepSeek 的 Anthropic 兼容接口。
 */
function extractAnthropicText(r: any): string {
  const content = r?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('')
}

/** OpenAI / 豆包：Responses API + 托管 `web_search`（responses.create，二者同形，仅 .env 不同）。 */
async function runViaResponses(input: string): Promise<any> {
  // 上游偶发以 SSE 流式返回（即便未请求 stream），SDK 解析时会抛错；显式非流式。
  const r = await (getOpenAI() as any).responses.create({
    model: MODEL,
    tools: [{ type: 'web_search' }],
    input,
    stream: false,
  })
  return parseAiJson(extractOutputText(r))
}

/**
 * DeepSeek：Anthropic 兼容接口（/anthropic）+ 托管 web_search 工具（联网由 DeepSeek 后端执行，无需外接搜索）。
 * 工具类型默认 Anthropic 的 `web_search_20250305`，可用 ANTHROPIC_WEB_SEARCH_TYPE 覆盖（版本号变动时免改代码）。
 */
async function runViaAnthropic(input: string): Promise<any> {
  const r = await (getAnthropic() as any).messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [
      {
        type: process.env.ANTHROPIC_WEB_SEARCH_TYPE || 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ],
    messages: [{ role: 'user', content: input }],
  })
  return parseAiJson(extractAnthropicText(r))
}

/**
 * 统一封装：联网搜索 + 取文本并容错解析为 JSON。最多重试 3 次，最终失败抛 HttpError(502)
 * （上游返回异常语义，而非自身 500）。
 * 服务商由 AI_PROVIDER 分流：默认 `openai`（含豆包，走 Responses API + `web_search`）；
 * `deepseek` 走 Anthropic 兼容接口（见 anthropic.ts、openai.ts 顶部 .env 说明）。
 */
export async function runWebSearchJson(input: string): Promise<any> {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase()
  const call = provider === 'deepseek' ? runViaAnthropic : runViaResponses
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await call(input)
      if (data) return data
      lastErr = new HttpError(502, 'AI 返回解析失败')
      console.error(`[AI] ${provider}/${MODEL} 第 ${attempt + 1} 次：返回内容无法解析为 JSON`)
    } catch (e) {
      lastErr = e
      // 记录真实上游错误（状态码 / 报文），避免最终只看到笼统的 502，无从排查
      const status = (e as any)?.status
      const detail = (e as any)?.error ? JSON.stringify((e as any).error) : (e as Error)?.message
      console.error(`[AI] ${provider}/${MODEL} 第 ${attempt + 1} 次失败：status=${status ?? '-'} ${String(detail).slice(0, 500)}`)
    }
  }
  if (lastErr instanceof HttpError) throw lastErr
  throw new HttpError(502, 'AI 服务暂时不可用，请稍后重试')
}
