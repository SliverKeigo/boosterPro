import { describe, it, expect, vi, beforeEach } from 'vitest'

// 以可控的假客户端替换两家 SDK，验证 runWebSearchJson 的服务商分流 + 取文本逻辑
const responsesCreate = vi.fn()
const messagesCreate = vi.fn()
vi.mock('@/lib/openai', () => ({
  getOpenAI: () => ({ responses: { create: responsesCreate } }),
  MODEL: 'test-model',
}))
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: messagesCreate } }),
}))

import { runWebSearchJson, parseAiJson } from '@/lib/ai'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AI_PROVIDER
})

describe('parseAiJson', () => {
  it('裸 JSON / ```json``` 围栏 / 文本夹带 三种都能解析', () => {
    expect(parseAiJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseAiJson('```json\n{"b":2}\n```')).toEqual({ b: 2 })
    expect(parseAiJson('前缀 {"c":3} 后缀')).toEqual({ c: 3 })
    expect(parseAiJson('没有 JSON')).toBeNull()
  })
})

describe('runWebSearchJson —— 服务商分流', () => {
  it('默认(OpenAI/豆包)走 Responses API，取 output_text', async () => {
    responsesCreate.mockResolvedValue({ output_text: '{"ok":1}' })
    const data = await runWebSearchJson('hi')
    expect(data).toEqual({ ok: 1 })
    expect(responsesCreate).toHaveBeenCalledTimes(1)
    expect(messagesCreate).not.toHaveBeenCalled()
    // 传了 web_search 工具 + 非流式
    const arg = responsesCreate.mock.calls[0][0]
    expect(arg.tools[0]).toEqual({ type: 'web_search' })
    expect(arg.stream).toBe(false)
  })

  it('Responses 无 output_text 时兜底取 output[].content[].text', async () => {
    responsesCreate.mockResolvedValue({
      output: [{ content: [{ type: 'output_text', text: '{"a":2}' }] }],
    })
    expect(await runWebSearchJson('hi')).toEqual({ a: 2 })
  })

  it('AI_PROVIDER=deepseek 走 Anthropic messages，取 text 块（忽略 web_search_tool_result）', async () => {
    process.env.AI_PROVIDER = 'deepseek'
    messagesCreate.mockResolvedValue({
      content: [
        { type: 'web_search_tool_result', content: [] },
        { type: 'text', text: '{"p":3}' },
      ],
    })
    const data = await runWebSearchJson('hi')
    expect(data).toEqual({ p: 3 })
    expect(messagesCreate).toHaveBeenCalledTimes(1)
    expect(responsesCreate).not.toHaveBeenCalled()
    const arg = messagesCreate.mock.calls[0][0]
    expect(arg.tools[0].name).toBe('web_search')
    expect(arg.messages[0]).toEqual({ role: 'user', content: 'hi' })
  })

  it('ANTHROPIC_WEB_SEARCH_TYPE 可覆盖工具类型', async () => {
    process.env.AI_PROVIDER = 'deepseek'
    process.env.ANTHROPIC_WEB_SEARCH_TYPE = 'web_search_99'
    messagesCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"z":9}' }] })
    await runWebSearchJson('hi')
    expect(messagesCreate.mock.calls[0][0].tools[0].type).toBe('web_search_99')
    delete process.env.ANTHROPIC_WEB_SEARCH_TYPE
  })

  it('解析失败重试 3 次后抛 HttpError 502', async () => {
    responsesCreate.mockResolvedValue({ output_text: '没有 JSON' })
    await expect(runWebSearchJson('hi')).rejects.toMatchObject({ status: 502 })
    expect(responsesCreate).toHaveBeenCalledTimes(3)
  })
})
