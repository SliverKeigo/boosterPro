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

// AI 服务商通过 .env 切换（本封装与服务商无关，只认下面三个变量）：
//  · OpenAI：       OPENAI_BASE_URL=https://api.openai.com/v1      OPENAI_MODEL=gpt-4o 等
//  · 字节跳动豆包    OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
//    (火山方舟 Ark)  OPENAI_API_KEY=<Ark API Key>   OPENAI_MODEL=<支持联网的豆包模型，如 doubao-seed-1-6-250615>
//  火山方舟的 Responses API 与 web_search 工具同 OpenAI 同形（responses.create + tools:[{type:'web_search'}]），
//  故切换到豆包仅需改这三个环境变量、无需改代码（响应取文本已做兼容兜底，见 ai.ts extractOutputText）。
export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o'
