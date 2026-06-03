'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// 可搜索下拉：输入即过滤选项。
//  - 静态模式(options)：选项已全部加载，前端按 label 即时过滤（字典 / 枚举等小列表）。
//  - 异步模式(fetchOptions)：按搜索词请求后端，由后端过滤后返回（客户 / 岗位 / 用户 / 部门等动态大列表）。
// 已选项回显：静态模式直接在 options 里找；异步模式优先用「刚选中的项」，编辑回显经 initialLabel 兜底。
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'

export interface SearchSelectOption {
  value: string
  label: string
}

interface SearchSelectProps {
  value: string
  onChange: (value: string) => void
  /** 静态模式：全部选项，前端按输入过滤 */
  options?: SearchSelectOption[]
  /** 异步模式：按搜索词从后端拉取（后端过滤）。与 options 二选一 */
  fetchOptions?: (q: string) => Promise<SearchSelectOption[]>
  /** 异步模式下当前 value 的回显文案（编辑时由父级从关联数据传入，避免回显成空/ID） */
  initialLabel?: string
  placeholder?: string
  disabled?: boolean
  /** 是否允许清空（显示 ×） */
  allowClear?: boolean
  /** 展示框附加 class（如 w-full） */
  className?: string
}

export function SearchSelect({
  value,
  onChange,
  options,
  fetchOptions,
  initialLabel,
  placeholder = '请选择',
  disabled = false,
  allowClear = false,
  className = 'w-full',
}: SearchSelectProps) {
  const isAsync = !!fetchOptions
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [list, setList] = useState<SearchSelectOption[]>([])
  const [loading, setLoading] = useState(false)
  // 异步模式记录「刚选中的项」，保证后端过滤后仍能正确回显（仅当其 value 与当前 value 一致时采用）
  const [picked, setPicked] = useState<SearchSelectOption | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // fetchOptions 存进 ref（在 effect 里更新，不在渲染期写 ref）：父级内联传函数也不会触发重复拉取
  const fetchRef = useRef(fetchOptions)
  useEffect(() => {
    fetchRef.current = fetchOptions
  })

  // 已选项展示文案（全部来自 props/state，不读 ref，渲染安全）
  let selectedLabel = ''
  if (value) {
    if (isAsync) {
      selectedLabel =
        (picked && picked.value === value ? picked.label : '') ||
        initialLabel ||
        list.find((o) => o.value === value)?.label ||
        ''
    } else {
      selectedLabel = (options ?? []).find((o) => o.value === value)?.label ?? ''
    }
  }

  // 异步模式：打开 + 输入变化时防抖请求后端（后端过滤）
  useEffect(() => {
    if (!isAsync || !open) return
    let active = true
    const t = setTimeout(() => {
      void (async () => {
        if (active) setLoading(true)
        try {
          const res = await fetchRef.current!(q.trim())
          if (active) setList(res)
        } catch {
          if (active) setList([])
        } finally {
          if (active) setLoading(false)
        }
      })()
    }, 250)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q, open, isAsync])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const openPanel = useCallback(() => {
    if (disabled) return
    setQ('')
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [disabled])

  const pick = (o: SearchSelectOption) => {
    setPicked(o)
    onChange(o.value)
    setOpen(false)
  }

  // 静态模式前端过滤；异步模式用后端返回的 list
  const shown = isAsync
    ? list
    : (options ?? []).filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      {/* 展示框（仿 select 外观，自带 chevron；不用 daisyUI .select 以免双重箭头） */}
      <div
        className={`input input-bordered flex w-full items-center justify-between gap-1 ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`}
        onMouseDown={(e) => {
          e.preventDefault()
          if (open) setOpen(false)
          else openPanel()
        }}
      >
        <span className={`truncate ${selectedLabel ? '' : 'text-base-content/40'}`}>
          {selectedLabel || placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {allowClear && value && !disabled && (
            <X
              className="h-3.5 w-3.5 text-base-content/40 hover:text-base-content"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange('')
              }}
            />
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-base-content/40" />
        </span>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-base-300 bg-base-100 shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-base-200 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-base-content/40" />
            <input
              ref={inputRef}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="输入以过滤…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-2 text-center text-xs text-base-content/40">加载中…</li>
            ) : shown.length === 0 ? (
              <li className="px-3 py-2 text-center text-xs text-base-content/40">无匹配项</li>
            ) : (
              shown.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-base-200 ${
                      o.value === value ? 'bg-primary/10 text-primary' : ''
                    }`}
                    onClick={() => pick(o)}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * 构造异步 fetchOptions：请求 `${url}?q=<词>`（由后端过滤），每行用 map 映射成 {value,label}。
 * 例：searchFetch('/api/clients/options', (c) => ({ value: String(c.id), label: c.shortName || c.fullName }))
 */
export function searchFetch(
  url: string,
  map: (row: any) => SearchSelectOption,
): (q: string) => Promise<SearchSelectOption[]> {
  return async (q: string) => {
    const sep = url.includes('?') ? '&' : '?'
    const full = q ? `${url}${sep}q=${encodeURIComponent(q)}` : url
    const res = await fetch(full)
    if (!res.ok) return []
    const j = await res.json()
    const rows: any[] = Array.isArray(j) ? j : j.data ?? []
    return rows.map(map)
  }
}
