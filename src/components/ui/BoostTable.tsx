'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from 'react'
import {
  Plus,
  Upload,
  Download,
  MoreHorizontal,
  Search,
  Columns3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Maximize2,
  Minimize2,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Dropdown } from './Dropdown'

export interface BoostColumn<T> {
  key: string
  title: string
  /** 取值函数，默认 record[key]（支持嵌套时自行传入） */
  accessor?: (record: T) => unknown
  /** 单元格渲染，默认直接显示取值 */
  render?: (value: any, record: T) => ReactNode
  /** 是否可排序，默认 true */
  sortable?: boolean
  /** 默认是否显示，默认 true（false 则在"显示列"里默认不勾选） */
  defaultVisible?: boolean
  width?: number
  align?: 'left' | 'center' | 'right'
}

interface MoreAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

interface BoostTableProps<T> {
  title?: string
  columns: BoostColumn<T>[]
  data: T[]
  loading?: boolean
  rowKey?: keyof T | ((r: T) => string | number)
  onCreate?: () => void
  createText?: string
  onImport?: () => void
  /** 不传则使用内置 CSV 导出（按可见列 + 当前筛选结果） */
  onExport?: () => void
  /** 是否显示导出按钮（受导出权限控制），默认 true */
  showExport?: boolean
  onRefresh?: () => void
  moreActions?: MoreAction[]
  actions?: (record: T) => ReactNode
  actionsWidth?: number
  pageSize?: number
  searchPlaceholder?: string
  /** 工具栏左下额外内容（如状态筛选下拉） */
  extraToolbar?: ReactNode
  emptyText?: string
}

function flatten(value: unknown, out: string[]) {
  if (value == null) return
  if (typeof value === 'object') {
    if (Array.isArray(value)) value.forEach((v) => flatten(v, out))
    else Object.values(value as Record<string, unknown>).forEach((v) => flatten(v, out))
  } else {
    out.push(String(value))
  }
}

const ICON_BTN =
  'btn btn-ghost btn-sm gap-1.5 font-medium text-base-content/70 hover:text-base-content'

export function BoostTable<T extends Record<string, any>>({
  title,
  columns,
  data,
  loading = false,
  rowKey = 'id' as keyof T,
  onCreate,
  createText = '新增',
  onImport,
  onExport,
  showExport = true,
  onRefresh,
  moreActions,
  actions,
  actionsWidth = 140,
  pageSize = 25,
  searchPlaceholder = '搜索全部字段…',
  extraToolbar,
  emptyText = '暂无数据',
}: BoostTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)
  const [fullscreen, setFullscreen] = useState(false)
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.defaultVisible !== false])),
  )

  const accessorOf = (col: BoostColumn<T>) =>
    col.accessor ?? ((r: T) => (r as any)[col.key])

  // 全字段模糊搜索
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((row) => {
      const parts: string[] = []
      flatten(row, parts)
      return parts.join(' ').toLowerCase().includes(q)
    })
  }, [data, search])

  // 排序
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtered
    const acc = accessorOf(col)
    const arr = [...filtered]
    arr.sort((a, b) => {
      const va = acc(a)
      const vb = acc(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      let cmp: number
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb), 'zh-CN')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pageCount)
  const paged = useMemo(
    () => sorted.slice((current - 1) * size, current * size),
    [sorted, current, size],
  )

  const visibleColumns = columns.filter((c) => visible[c.key])

  const getKey = (r: T, i: number): string | number => {
    if (typeof rowKey === 'function') return rowKey(r)
    return (r as any)[rowKey] ?? i
  }

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
    }
  }

  const builtinExport = () => {
    const cols = visibleColumns
    const header = cols.map((c) => c.title).join(',')
    const lines = sorted.map((r) =>
      cols
        .map((c) => {
          const v = accessorOf(c)(r)
          const s = v == null ? '' : String(v)
          return `"${s.replace(/"/g, '""')}"`
        })
        .join(','),
    )
    const csv = '﻿' + [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sortableColumns = columns.filter((c) => c.sortable !== false)

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[200] flex flex-col gap-3 bg-base-200 p-5 overflow-auto'
          : 'flex h-full min-h-0 w-full flex-1 flex-col gap-3'
      }
    >
      {/* ── 工具栏 ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
        {title && (
          <h2 className="mr-2 text-base font-bold text-base-content">{title}</h2>
        )}

        {onCreate && (
          <button type="button" className="btn btn-primary btn-sm gap-1.5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {createText}
          </button>
        )}
        {onImport && (
          <button type="button" className={ICON_BTN} onClick={onImport}>
            <Upload className="h-4 w-4" />
            导入
          </button>
        )}
        {showExport && (
          <button type="button" className={ICON_BTN} onClick={onExport ?? builtinExport}>
            <Download className="h-4 w-4" />
            导出
          </button>
        )}
        {moreActions && moreActions.length > 0 && (
          <Dropdown
            width={180}
            align="left"
            trigger={
              <span className={ICON_BTN}>
                <MoreHorizontal className="h-4 w-4" />
                更多
              </span>
            }
          >
            {(close) => (
              <ul className="menu menu-sm w-full p-0">
                {moreActions.map((a, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={a.danger ? 'text-error' : ''}
                      onClick={() => {
                        close()
                        a.onClick()
                      }}
                    >
                      {a.icon}
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Dropdown>
        )}

        <div className="grow" />

        {/* 搜索框 */}
        <label className="input input-bordered input-sm flex max-w-[260px] items-center gap-2">
          <Search className="h-4 w-4 text-base-content/40" />
          <input
            type="text"
            className="grow"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </label>

        {/* 显示列 */}
        <Dropdown
          width={220}
          trigger={
            <span className={ICON_BTN}>
              <Columns3 className="h-4 w-4" />
              显示列
            </span>
          }
        >
          <div className="max-h-72 overflow-y-auto">
            <div className="px-2 py-1.5 text-xs font-semibold text-base-content/50">
              勾选要显示的列
            </div>
            {columns.map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={visible[c.key]}
                  onChange={(e) => setVisible((v) => ({ ...v, [c.key]: e.target.checked }))}
                />
                <span className="text-sm">{c.title}</span>
              </label>
            ))}
          </div>
        </Dropdown>

        {/* 排序 */}
        <Dropdown
          width={220}
          trigger={
            <span className={ICON_BTN}>
              <ArrowUpDown className="h-4 w-4" />
              排序
            </span>
          }
        >
          {(close) => (
            <div className="max-h-72 overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-semibold text-base-content/50">
                选择排序字段
              </div>
              {sortKey && (
                <button
                  type="button"
                  className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-error hover:bg-base-200"
                  onClick={() => {
                    setSortKey(null)
                    close()
                  }}
                >
                  清除排序
                </button>
              )}
              {sortableColumns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-base-200"
                  onClick={() => toggleSort(c.key)}
                >
                  <span>{c.title}</span>
                  {sortKey === c.key &&
                    (sortDir === 'asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 text-primary" />
                    ))}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* 刷新 */}
        <button
          type="button"
          aria-label="刷新"
          className="btn btn-ghost btn-sm btn-square text-base-content/70"
          onClick={onRefresh}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* 全屏 */}
        <button
          type="button"
          aria-label={fullscreen ? '退出全屏' : '全屏'}
          className="btn btn-ghost btn-sm btn-square text-base-content/70"
          onClick={() => setFullscreen((f) => !f)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {extraToolbar && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-2.5 shadow-sm">
          {extraToolbar}
        </div>
      )}

      {/* ── 表格 ── */}
      <div className="relative flex min-h-0 grow flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-base-100/60">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        )}
        <div className="grow overflow-auto">
          <table className="table table-zebra w-max min-w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-base-200">
                {visibleColumns.map((c) => {
                  const active = sortKey === c.key
                  const sortable = c.sortable !== false
                  return (
                    <th
                      key={c.key}
                      style={{ width: c.width, minWidth: c.width }}
                      className="text-xs font-semibold uppercase tracking-wide text-base-content/60"
                    >
                      <button
                        type="button"
                        disabled={!sortable}
                        onClick={() => sortable && toggleSort(c.key)}
                        className={`flex items-center gap-1 ${
                          sortable ? 'cursor-pointer hover:text-base-content' : 'cursor-default'
                        } ${c.align === 'center' ? 'mx-auto' : c.align === 'right' ? 'ml-auto' : ''}`}
                      >
                        {c.title}
                        {sortable &&
                          (active ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-primary" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          ))}
                      </button>
                    </th>
                  )
                })}
                {actions && (
                  <th
                    style={{ width: actionsWidth, minWidth: actionsWidth }}
                    className="sticky right-0 z-20 border-l border-base-300 bg-base-200 text-xs font-semibold uppercase tracking-wide text-base-content/60 shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.12)]"
                  >
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => (
                <tr key={getKey(r, i)} className="hover:bg-primary/5">
                  {visibleColumns.map((c) => {
                    const value = accessorOf(c)(r)
                    return (
                      <td
                        key={c.key}
                        className="text-sm"
                        style={{ textAlign: c.align }}
                      >
                        {c.render ? c.render(value, r) : value == null ? (
                          <span className="text-base-content/30">—</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    )
                  })}
                  {actions && (
                    <td className="sticky right-0 z-10 border-l border-base-300 bg-base-100 shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.12)]">
                      {actions(r)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && paged.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-base-content/40">
              <Inbox className="h-12 w-12" />
              <span className="text-sm">{emptyText}</span>
            </div>
          )}
        </div>

        {/* 分页 */}
        {sorted.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-4 border-t border-base-300 px-4 py-3">
            <div className="flex items-center gap-3 whitespace-nowrap text-sm text-base-content/60">
              <span className="whitespace-nowrap">共 {sorted.length} 条</span>
              <select
                className="select select-bordered select-xs"
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value))
                  setPage(1)
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} 条/页
                  </option>
                ))}
              </select>
            </div>
            <div className="join">
              <button
                type="button"
                className="btn btn-sm join-item"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="btn btn-sm join-item pointer-events-none">
                {current} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-sm join-item"
                disabled={current >= pageCount}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
