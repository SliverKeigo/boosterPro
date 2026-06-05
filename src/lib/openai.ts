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

// AI 服务商通过 .env 切换（见 ai.ts 的 runWebSearchJson 分流）：
//  · OpenAI（默认）：OPENAI_BASE_URL=https://api.openai.com/v1            OPENAI_MODEL=gpt-4o
//  · 豆包(火山方舟)： OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
//                   OPENAI_API_KEY=<Ark Key>   OPENAI_MODEL=doubao-seed-1-6-250615
//    —— 以上两家同走 responses.create + tools:[{type:'web_search'}]，仅改 .env、不改代码。
//  · DeepSeek：     AI_PROVIDER=deepseek（改走 Anthropic 兼容接口，见 anthropic.ts / ai.ts）
//                   ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
//                   ANTHROPIC_API_KEY=<DeepSeek Key>   AI_MODEL=deepseek-v4-flash
// 模型名服务商无关：AI_MODEL 优先、回退 OPENAI_MODEL、默认 gpt-4o。
export const MODEL = process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o'
