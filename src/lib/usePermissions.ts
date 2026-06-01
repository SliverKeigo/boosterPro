'use client'
// 客户端权限 hook：拉取当前用户对八个资源的功能权限，供页面控制按钮显隐 / 行级编辑权限。
import { useEffect, useState } from 'react'

export interface MyPermissions {
  isAdmin: boolean
  userId: number | null
  permissions: Record<string, string[]> // resource → actions
}

// 模块级缓存：同一会话内多页面共享，避免每次进页面都请求一遍
// 加 TTL：管理员改了权限组后，在线用户无需重登，最多等待一个 TTL 周期即自动拉到最新权限
const TTL = 60_000
let cache: MyPermissions | null = null
let cachedAt = 0

// 缓存是否仍在有效期内
function isFresh(): boolean {
  return cache !== null && Date.now() - cachedAt < TTL
}

export function useMyPermissions() {
  // 初始 state 用缓存兜底；若已过期，下方 effect 会重新拉取并刷新 state
  const [perm, setPerm] = useState<MyPermissions | null>(cache)
  const [loading, setLoading] = useState(!isFresh())

  useEffect(() => {
    if (isFresh()) return
    let active = true
    // 注意：IIFE 首条语句即 await，effect 同步路径不含 setState（规避 react-hooks/set-state-in-effect）
    void (async () => {
      try {
        const res = await fetch('/api/permissions/my')
        if (!res.ok) return
        const json = (await res.json()) as MyPermissions
        cache = json
        cachedAt = Date.now()
        if (active) setPerm(json)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // 是否拥有某资源的某功能权限
  const can = (resource: string, action: string): boolean =>
    !!perm && (perm.isAdmin || (perm.permissions[resource] ?? []).includes(action))

  // 行级：是否可写该行（本人创建或管理员）。配合 can(resource,'EDIT'/'DELETE') 使用
  const isOwner = (row: { createdById?: number | null } | null | undefined): boolean =>
    !!perm && (perm.isAdmin || (!!row && row.createdById === perm.userId))

  return {
    perm,
    loading,
    can,
    isOwner,
    isAdmin: perm?.isAdmin ?? false,
    userId: perm?.userId ?? null,
  }
}

// 供登出等场景清空缓存（用户切换时调用）
export function clearPermissionCache() {
  cache = null
  cachedAt = 0
}
