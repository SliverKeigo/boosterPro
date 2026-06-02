import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  getPermissionMap: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ runWebSearchJson: vi.fn() }))

import { getCurrentUser, getPermissionMap } from '@/lib/permissions'
import { runWebSearchJson } from '@/lib/ai'
import { POST } from '@/app/api/ai/job-profile/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/ai/job-profile', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/ai/job-profile', () => {
  it('未登录 → 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await post({ jobDescription: 'JD 内容' })
    expect(res.status).toBe(401)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('对 REQUIREMENT 无 CREATE/EDIT → 403', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ REQUIREMENT: ['VIEW'] })
    const res = await post({ jobDescription: 'JD 内容' })
    expect(res.status).toBe(403)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('缺少 JD → 400', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ REQUIREMENT: ['EDIT'] })
    const res = await post({ jobDescription: '  ' })
    expect(res.status).toBe(400)
    expect(runWebSearchJson).not.toHaveBeenCalled()
  })

  it('有 EDIT 权限 → 调用 AI 并归一化 profiles', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 2, isAdmin: false })
    mock(getPermissionMap).mockResolvedValue({ REQUIREMENT: ['EDIT'] })
    mock(runWebSearchJson).mockResolvedValue({
      profiles: [
        { category: '专业技能', description: '精通 Go' },
        { name: '行业经验', content: '金融背景' },
      ],
    })
    const res = await post({ jobDescription: 'JD', positionName: '后端' })
    expect(res.status).toBe(200)
    expect(runWebSearchJson).toHaveBeenCalledTimes(1)
    const body = await res.json()
    expect(body.profiles).toEqual([
      { category: '专业技能', description: '精通 Go' },
      { category: '行业经验', description: '金融背景' },
    ])
  })

  it('AI 返回空 profiles → 502', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(getPermissionMap).mockResolvedValue({})
    mock(runWebSearchJson).mockResolvedValue({ profiles: [] })
    const res = await post({ jobDescription: 'JD' })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'AI 返回解析失败' })
  })

  it('AI 调用抛普通错误 → 500 带友好前缀', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(getPermissionMap).mockResolvedValue({})
    mock(runWebSearchJson).mockRejectedValue(new Error('boom'))
    const res = await post({ jobDescription: 'JD' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('AI 分析失败')
  })
})
