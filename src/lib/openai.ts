import OpenAI from 'openai'

let _client: OpenAI | null = null

/**
 * 懒加载 OpenAI 客户端：仅在真正调用 AI 时才构造。
 * 不在模块顶层 `new OpenAI()`——否则未配 OPENAI_API_KEY 时，SDK 会在【模块加载期】
 * （如 `next build` 收集 /api/ai/* 页面数据时）抛「Missing credentials」导致整包构建失败。
 * 懒加载后：无 key 也能正常构建与运行，只有实际调用 AI 接口时才报错（被上层兜成 502）。
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      timeout: 90_000, // 联网搜索较慢，给 90s 超时上限，避免请求无限挂起
    })
  }
  return _client
}

export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o'
