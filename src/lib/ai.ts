/* eslint-disable @typescript-eslint/no-explicit-any */

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
