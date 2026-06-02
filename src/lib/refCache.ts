/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单下拉「引用数据」（clients / users / departments / requirements 等）的轻量缓存。
// 目的：不在列表页挂载时就并发预拉，而是打开新增/编辑弹窗时按需加载；
// 并按 url 缓存 + 在途去重，跨页 / 重复打开直接命中，减少请求瀑布。
const TTL = 60_000

interface Entry {
  at: number
  data: any[]
}

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<any[]>>()

// 取某接口的 data 数组：命中未过期缓存直接返回；否则发起请求（并发去重），失败返回 []。
export async function refGet(url: string): Promise<any[]> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.data

  const existing = inflight.get(url)
  if (existing) return existing

  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j) => {
      const data = (j.data ?? []) as any[]
      cache.set(url, { at: Date.now(), data })
      return data
    })
    .catch(() => [] as any[])
    .finally(() => {
      inflight.delete(url)
    })

  inflight.set(url, p)
  return p
}

// 主动失效（如新增了某类引用数据后）：传 url 清单个，不传清全部。
export function clearRefCache(url?: string) {
  if (url) cache.delete(url)
  else cache.clear()
}
