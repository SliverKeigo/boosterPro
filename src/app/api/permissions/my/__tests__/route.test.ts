import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from '@/lib/apiError'

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(),
  getPermissionMap: vi.fn(),
}))

import { getCurrentUser, getPermissionMap } from '@/lib/permissions'
import { GET } from '@/app/api/permissions/my/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/permissions/my', () => {
  it('未登录（getCurrentUser→null）→ 401', async () => {
    mock(getCurrentUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: '未登录' })
    expect(getPermissionMap).not.toHaveBeenCalled()
  })

  it('已登录 → 返回 {isAdmin,userId,permissions}', async () => {
    const user = { id: 7, isAdmin: false }
    const permMap = { CANDIDATE: ['VIEW', 'CREATE'], KNOWLEDGE: ['VIEW'] }
    mock(getCurrentUser).mockResolvedValue(user)
    mock(getPermissionMap).mockResolvedValue(permMap)
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      isAdmin: false,
      userId: 7,
      permissions: permMap,
    })
    expect(getPermissionMap).toHaveBeenCalledWith(user)
  })

  it('管理员 → isAdmin true', async () => {
    mock(getCurrentUser).mockResolvedValue({ id: 1, isAdmin: true })
    mock(getPermissionMap).mockResolvedValue({})
    const res = await GET()
    const body = await res.json()
    expect(body.isAdmin).toBe(true)
    expect(body.userId).toBe(1)
  })

  it('内部抛 HttpError → handleApiError 透传状态码', async () => {
    mock(getCurrentUser).mockRejectedValue(new HttpError(401, '未登录或登录已过期'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
