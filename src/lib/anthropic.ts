import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

/**
 * 懒加载 Anthropic 客户端（同 openai.ts 的理由：不在模块顶层 new，未配 key 时也能正常 build/运行，
 * 只有 AI_PROVIDER=deepseek 实际调用 AI 时才构造）。
 *
 * 用于接入 DeepSeek：走其 Anthropic 兼容接口
 *   ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
 *   ANTHROPIC_API_KEY=<DeepSeek API Key>
 * 该接口支持 Anthropic 的托管 web_search 工具（文档兼容性矩阵列 web_search_tool_result 为支持），
 * 故联网搜索由 DeepSeek 后端执行，无需我们外接搜索引擎。
 */
export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL,
      timeout: 90_000, // 联网搜索较慢，给 90s 上限，避免请求无限挂起
    })
  }
  return _client
}
