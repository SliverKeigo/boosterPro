'use client'
// 字典下拉 hook：按字典类型 code 拉取启用的字典项，供各表单下拉使用。
// 字典项变动不频繁，用模块级缓存按 code 缓存；登出或字典管理保存后可调 clearDictCache 失效。
import { useEffect, useState } from 'react'

export interface DictOption {
  label: string
  value: string
}

const cache: Record<string, DictOption[]> = {}

export function useDict(code: string) {
  // 初始用缓存兜底（code 稳定时即时命中，无闪烁）
  const [items, setItems] = useState<DictOption[]>(cache[code] ?? [])
  const [loading, setLoading] = useState(!cache[code])

  useEffect(() => {
    // 每次挂载都后台 revalidate：useState 初值已用缓存兜底（无闪烁），这里拉最新字典覆盖缓存——
    // 避免管理员改了字典后，长开的页面仍显示旧选项（旧实现命中缓存就 return，需整页刷新才更新）。
    let active = true
    // IIFE 首条语句即 await，effect 同步路径不含 setState（规避 react-hooks/set-state-in-effect）
    void (async () => {
      try {
        const res = await fetch(`/api/dict/${encodeURIComponent(code)}`)
        if (!res.ok) return
        const json = await res.json()
        const list: DictOption[] = json.data ?? []
        cache[code] = list
        if (active) setItems(list)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [code])

  return { items, loading }
}

// 字典管理保存后 / 登出时清缓存，使下拉下次取最新值
export function clearDictCache(code?: string) {
  if (code) delete cache[code]
  else for (const k of Object.keys(cache)) delete cache[k]
}
