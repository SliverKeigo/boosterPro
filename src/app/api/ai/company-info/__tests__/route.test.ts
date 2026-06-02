import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  getPermissionMap: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ runWebSearchJson: vi.fn() }))

import { getCurrentUser, getPermissionMap } from '@/lib/permissions'
import { runWebSearchJson } from '@/lib/ai'
import { POST } from '@/app/api/ai/company-info/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/ai/company-info', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/ai/company-info', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await post({ companyName: '字节跳动' })
    expect(res.status).toBe(401)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('对 CUSTOMER 无 CREATE/EDIT → 403', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ CUSTOMER: ['VIEW'] })
    const res = await post({ companyName: '字节跳动' })
    expect(res.status).toBe(403)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('缺少公司名称 → 400', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ CUSTOMER: ['CREATE'] })
    const res = await post({ companyName: '   ' })
    expect(res.status).toBe(400)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('有 CREATE 权限 → 调用 AI 并返回结构化结果', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ CUSTOMER: ['CREATE'] })
    mock(runWebSearchJson).mockResolvedValue({
      industry: '互联网',
      region: '北京',
      formerName: '',
      companyCulture: '狼性',
      benchmarkCompanies: ['腾讯', '阿里'],
    })
    const res = await post({ companyName: '字节跳动' })
    expect(res.status).toBe(200)
    expect(runWebSearchJson).toHaveBeenCalledTimes(1)
    const body = await res.json()
    expect(body).toEqual({
      industry: '互联网',
      region: '北京',
      formerName: '',
      companyCulture: '狼性',
      benchmarkCompanies: '腾讯、阿里',
    })
  })

  it('管理员绕过功能权限 → 200', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(getPermissionMap).mockResolvedValue({})
    mock(runWebSearchJson).mockResolvedValue({ industry: '金融' })
    const res = await post({ companyName: '某公司' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.industry).toBe('金融')
    // benchmarkCompanies 非数组时按原值/空串返回
    expect(body.benchmarkCompanies).toBe('')
  })

  it('AI 调用抛普通错误 → 500 带友好前缀', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(getPermissionMap).mockResolvedValue({})
    mock(runWebSearchJson).mockRejectedValue(new Error('boom'))
    const res = await post({ companyName: '某公司' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('AI 生成失败')
  })
})
