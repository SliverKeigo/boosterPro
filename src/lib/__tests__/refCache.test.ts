import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { refGet, clearRefCache } from '@/lib/refCache'

// refGet 取的是 j.data 数组：fetch 返回 { ok, json: () => ({ data: [...] }) }
const makeFetch = () =>
  vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 1 }] }) }))

beforeEach(() => {
  clearRefCache() // 清掉全部缓存，避免跨用例串味
  vi.stubGlobal('fetch', makeFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('refGet 缓存与去重', () => {
  it('两次顺序调用命中缓存，fetch 只发一次', async () => {
    const url = '/api/clients'
    const a = await refGet(url)
    const b = await refGet(url)
    expect(a).toEqual([{ id: 1 }])
    expect(b).toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('并发调用在途去重，fetch 只发一次', async () => {
    const url = '/api/users'
    const [a, b] = await Promise.all([refGet(url), refGet(url)])
    expect(a).toEqual([{ id: 1 }])
    expect(b).toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('不同 url 各自请求', async () => {
    await refGet('/api/clients')
    await refGet('/api/departments')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clearRefCache(url) 后重新请求', async () => {
    const url = '/api/clients'
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(1)
    clearRefCache(url)
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clearRefCache() 清全部后重新请求', async () => {
    await refGet('/api/clients')
    await refGet('/api/users')
    expect(fetch).toHaveBeenCalledTimes(2)
    clearRefCache()
    await refGet('/api/clients')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('TTL(60s) 过期后重新请求', async () => {
    vi.useFakeTimers()
    const url = '/api/clients'
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(1)

    // 未过期：仍命中缓存
    vi.advanceTimersByTime(59_000)
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(1)

    // 越过 TTL（60_000ms）：重新拉取
    vi.advanceTimersByTime(2_000)
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fetch 失败(reject) 返回空数组且不缓存', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    const url = '/api/clients'
    const data = await refGet(url)
    expect(data).toEqual([])
    // 失败未写缓存：再次调用会再次尝试
    await refGet(url)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('响应 !ok 时返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const data = await refGet('/api/clients')
    expect(data).toEqual([])
  })
})
