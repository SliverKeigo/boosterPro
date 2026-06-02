import { describe, it, expect, beforeAll } from 'vitest'
import { api, anon, login } from './_client'

// 真实打 dev server：AI 路由的鉴权 + 入参校验 + 可达性。
// 生成本身依赖外部 OpenAI（可能未配置），故对“生成成功”宽松处理：
// 守卫通过后，接受 200(成功) 或 4xx/5xx(外部 AI 不可用)，只要不是 401/403 且不是意外崩溃。

// 守卫已通过：状态既不是 401 也不是 403，且响应是合法 JSON（不是 HTML 错误页/空体）。
function expectGuardPassed(r: { status: number; data: unknown }) {
  expect(r.status).not.toBe(401)
  expect(r.status).not.toBe(403)
  // 路由所有分支都 NextResponse.json(...)，响应体必须是对象
  expect(r.data && typeof r.data === 'object').toBe(true)
}

describe('E2E AI 路由', () => {
  beforeAll(async () => {
    await login()
  })

  describe('/api/ai/company-info', () => {
    it('匿名 → 401', async () => {
      const r = await anon('POST', '/api/ai/company-info', { companyName: '字节跳动' })
      expect(r.status).toBe(401)
    })

    it('管理员缺 companyName → 400', async () => {
      const r = await api('POST', '/api/ai/company-info', {})
      expect(r.status).toBe(400)
    })

    it('管理员空白 companyName → 400', async () => {
      const r = await api('POST', '/api/ai/company-info', { companyName: '   ' })
      expect(r.status).toBe(400)
    })

    it('管理员带 companyName → 守卫通过(非401/403)，生成宽松', async () => {
      const r = await api('POST', '/api/ai/company-info', { companyName: '字节跳动' })
      expectGuardPassed(r)
      if (r.status === 200) {
        // 成功路径：返回结构化客户档案字段
        expect(r.data).toHaveProperty('industry')
        expect(r.data).toHaveProperty('region')
        expect(r.data).toHaveProperty('benchmarkCompanies')
      } else {
        // 失败路径：外部 AI 不可用/解析失败，返回 JSON error（502 透传 / 500 友好包装）
        expect([500, 502]).toContain(r.status)
        expect(r.data).toHaveProperty('error')
      }
    })
  })

  describe('/api/ai/job-profile', () => {
    it('匿名 → 401', async () => {
      const r = await anon('POST', '/api/ai/job-profile', {
        jobDescription: '负责后端服务开发',
        positionName: '后端工程师',
      })
      expect(r.status).toBe(401)
    })

    it('管理员缺 jobDescription → 400', async () => {
      const r = await api('POST', '/api/ai/job-profile', { positionName: '后端工程师' })
      expect(r.status).toBe(400)
    })

    it('管理员空白 jobDescription → 400', async () => {
      const r = await api('POST', '/api/ai/job-profile', { jobDescription: '  ' })
      expect(r.status).toBe(400)
    })

    it('管理员带 JD → 守卫通过(非401/403)，生成宽松', async () => {
      const r = await api('POST', '/api/ai/job-profile', {
        jobDescription:
          '负责公司核心交易系统的后端开发，要求精通 Java/Go，熟悉分布式与高并发，5 年以上经验。',
        positionName: '高级后端工程师',
      })
      expectGuardPassed(r)
      if (r.status === 200) {
        // 成功路径：返回 profiles 数组
        expect(Array.isArray((r.data as { profiles?: unknown }).profiles)).toBe(true)
      } else {
        // 失败路径：502(解析失败) / 500(调用失败)，返回 JSON error
        expect([500, 502]).toContain(r.status)
        expect(r.data).toHaveProperty('error')
      }
    })
  })
})
