import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  timeout: 90_000, // 联网搜索较慢，给 90s 超时上限，避免请求无限挂起
})

export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o'
