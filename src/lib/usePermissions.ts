'use client'
// 客户端权限 hook：拉取当前用户对八个资源的功能权限，供页面控制按钮显隐 / 行级编辑权限。
import { useEffect, useSyncExternalStore } from 'react'

export interface MyPermissions {
  isAdmin: boolean
  userId: number | null
  departmentId: number | null // 当前用户所属部门，供表单"提交人部门"自动预填
  groupId: number | null // 当前用户所属组
  ledGroupId: number | null // 作为组长所领的组（工作计划「新增」据此显隐）
  permissions: Record<string, string[]> // resource → actions
  // 「可编辑授权概要」：被授予 EDIT 的数据来源（创建者 userId / 创建者部门 deptId），
  // 供 canEditRow 镜像后端行级编辑权（view 由后端过滤保证，前端只需 edit 维度）。
  grants?: Record<string, { editUserIds: number[]; editDeptIds: number[] }>
}

// ─── 模块级 store ────────────────────────────────────────────────────────────
// 单一缓存 + 订阅通知：所有组件经 useSyncExternalStore 共享同一份快照，
// TTL 刷新 / 登出清空后，全部订阅者同步收到最新值（修复跨组件不一致）。
// 加 TTL：管理员改了权限组后，在线用户无需重登，回到前台 / 一个 TTL 周期后即拉到最新权限。
const TTL = 60_000
let cache: MyPermissions | null = null
let cachedAt = 0
// 订阅者集合：useSyncExternalStore 注册的重渲染回调
const subscribers = new Set<() => void>()
// 在途请求：多组件同时过期时复用同一个 fetch，避免重复打 /api/permissions/my
let inflight: Promise<void> | null = null

// 缓存是否仍在有效期内
function isFresh(): boolean {
  return cache !== null && Date.now() - cachedAt < TTL
}

// 通知所有订阅者：cache 引用已变化，触发各组件重渲染
function notify(): void {
  subscribers.forEach((cb) => cb())
}

// 拉取权限。force=true 时无视 TTL 强制刷新；否则 fresh 直接返回。
// 在途请求去重；成功更新 cache+cachedAt 并通知；失败静默；finally 清空 inflight。
function load(force = false): Promise<void> {
  if (!force && isFresh()) return Promise.resolve()
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch('/api/permissions/my')
      if (!res.ok) return
      const json = (await res.json()) as MyPermissions
      cache = json
      cachedAt = Date.now()
      notify()
    } catch {
      // 静默失败：不抛出，保留旧缓存，下次回前台 / 过期再试
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// ─── useSyncExternalStore 三件套 ─────────────────────────────────────────────
function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

// 当前快照：cache 仅在真正更新（load 成功 / clear）时换引用，引用稳定可安全返回
function getSnapshot(): MyPermissions | null {
  return cache
}

// SSR / 首屏快照：服务端无缓存
function getServerSnapshot(): MyPermissions | null {
  return null
}

export function useMyPermissions() {
  const perm = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    // 挂载即尝试加载（过期才会真正发请求）；常驻 layout 也由此覆盖 TTL 过期场景。
    // 注意：不在 effect 内 setState —— 数据回填经 store.notify 触发重渲染，
    // 规避 react-hooks/set-state-in-effect。
    void load()
    // 回到前台时刷新，让权限变更尽快生效
    const onFocus = () => void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // 是否拥有某资源的某功能权限
  const can = (resource: string, action: string): boolean =>
    !!perm && (perm.isAdmin || (perm.permissions[resource] ?? []).includes(action))

  // 行级：是否可写该行（本人创建或管理员）。配合 can(resource,'EDIT'/'DELETE') 使用
  const isOwner = (row: { createdById?: number | null } | null | undefined): boolean =>
    !!perm && (perm.isAdmin || (!!row && row.createdById === perm.userId))

  // 行级：是否可编辑该行（镜像后端 assertRowAccess 的 write 判定）。
  // 本人创建 / 管理员 / 被授「编辑」该行来源（按创建者 userId 或创建者部门 deptId）→ 可编辑。
  // 注意仍需配合 can(resource,'EDIT'/'DELETE') —— 本函数只判数据归属，不判功能权限。
  const canEditRow = (
    resource: string,
    // 允许 null/undefined：各页 onEdit={...canEditRow(RES, editing)...} 在「新增」模式 editing 为 null，
    // 非管理员(不走 isAdmin 短路)会以 null 调入 → 不防护则 null.createdById 直接崩整页(管理员测不出)。
    row: {
      createdById?: number | null
      createdBy?: { id?: number | null; departmentId?: number | null } | null
    } | null | undefined,
  ): boolean => {
    if (!perm || !row) return false
    if (perm.isAdmin) return true
    if (row.createdById === perm.userId) return true
    const g = perm.grants?.[resource]
    if (!g) return false
    if (row.createdById != null && g.editUserIds.includes(row.createdById)) return true
    if (row.createdBy?.departmentId != null && g.editDeptIds.includes(row.createdBy.departmentId)) return true
    return false
  }

  return {
    perm,
    loading: perm === null,
    can,
    isOwner,
    canEditRow,
    isAdmin: perm?.isAdmin ?? false,
    userId: perm?.userId ?? null,
    departmentId: perm?.departmentId ?? null,
    groupId: perm?.groupId ?? null,
    ledGroupId: perm?.ledGroupId ?? null,
  }
}

// 供登出等场景清空缓存（用户切换时调用）：清空并通知所有订阅者立即重渲染
export function clearPermissionCache() {
  cache = null
  cachedAt = 0
  notify()
}
