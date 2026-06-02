// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDict, clearDictCache } from '@/lib/useDict'
import { useMyPermissions, clearPermissionCache } from '@/lib/usePermissions'

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── useDict ────────────────────────────────────────────────────────────────
describe('useDict', () => {
  beforeEach(() => {
    clearDictCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ label: '猎头', value: 'HUNTER' }] }),
      })),
    )
  })

  it('loading → loaded 过渡，并返回 { items, loading }', async () => {
    const { result } = renderHook(() => useDict('SOURCE'))
    // 未缓存时初始 loading=true，items 空
    expect(result.current.loading).toBe(true)
    expect(result.current.items).toEqual([])

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([{ label: '猎头', value: 'HUNTER' }])
    expect(fetch).toHaveBeenCalledTimes(1)
    // 请求按 code 编码
    expect((fetch as any).mock.calls[0][0]).toContain('/api/dict/SOURCE')
  })

  it('模块级缓存：相同 code 第二次 renderHook 不再发请求', async () => {
    const first = renderHook(() => useDict('SOURCE'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(1)

    // 第二个组件命中缓存：立即拿到数据、不 loading、不再 fetch
    const second = renderHook(() => useDict('SOURCE'))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.items).toEqual([{ label: '猎头', value: 'HUNTER' }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('clearDictCache 后重新拉取', async () => {
    const first = renderHook(() => useDict('SOURCE'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(1)

    clearDictCache('SOURCE')
    const second = renderHook(() => useDict('SOURCE'))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('响应 !ok 时 loading 结束且 items 保持空', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    clearDictCache()
    const { result } = renderHook(() => useDict('OTHER'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})

// ─── useMyPermissions ────────────────────────────────────────────────────────
const permPayload = (over: Partial<{ isAdmin: boolean; userId: number; permissions: Record<string, string[]> }> = {}) => ({
  isAdmin: false,
  userId: 7,
  permissions: { CANDIDATE: ['VIEW', 'EDIT'] },
  ...over,
})

const stubPermFetch = (payload: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })))

describe('useMyPermissions', () => {
  beforeEach(() => {
    clearPermissionCache()
    stubPermFetch(permPayload())
  })

  it('loading → loaded，返回 { perm, loading, can, isOwner, isAdmin, userId }', async () => {
    const { result } = renderHook(() => useMyPermissions())
    expect(result.current.loading).toBe(true)
    expect(result.current.perm).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect((fetch as any).mock.calls[0][0]).toBe('/api/permissions/my')
    expect(result.current.perm).toMatchObject({ userId: 7, isAdmin: false })
    expect(result.current.userId).toBe(7)
    expect(result.current.isAdmin).toBe(false)
    expect(typeof result.current.can).toBe('function')
    expect(typeof result.current.isOwner).toBe('function')
  })

  it('can(resource, action) 按权限载荷计算', async () => {
    const { result } = renderHook(() => useMyPermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.can('CANDIDATE', 'VIEW')).toBe(true)
    expect(result.current.can('CANDIDATE', 'EDIT')).toBe(true)
    expect(result.current.can('CANDIDATE', 'DELETE')).toBe(false)
    // 未授权资源
    expect(result.current.can('CONTRACT', 'VIEW')).toBe(false)
  })

  it('isOwner(row)：本人创建为 true，他人为 false', async () => {
    const { result } = renderHook(() => useMyPermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isOwner({ createdById: 7 })).toBe(true)
    expect(result.current.isOwner({ createdById: 99 })).toBe(false)
    expect(result.current.isOwner(null)).toBe(false)
    expect(result.current.isOwner(undefined)).toBe(false)
  })

  it('管理员：can 任意、isOwner 任意行均为 true', async () => {
    clearPermissionCache()
    stubPermFetch(permPayload({ isAdmin: true, permissions: {} }))
    const { result } = renderHook(() => useMyPermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.can('CONTRACT', 'DELETE')).toBe(true)
    expect(result.current.can('REPORT', 'EXPORT')).toBe(true)
    expect(result.current.isOwner({ createdById: 99999 })).toBe(true)
  })

  it('模块级缓存：第二次 renderHook 不再 fetch', async () => {
    const first = renderHook(() => useMyPermissions())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(1)

    const second = renderHook(() => useMyPermissions())
    // 命中 fresh 缓存：直接拿到快照、不 loading、不再发请求
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.userId).toBe(7)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('clearPermissionCache 后回到未登录态(perm=null)', async () => {
    const { result } = renderHook(() => useMyPermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    clearPermissionCache()
    // 清空后快照为 null，订阅者收到通知重渲染
    await waitFor(() => expect(result.current.perm).toBeNull())
    expect(result.current.loading).toBe(true)
  })
})
