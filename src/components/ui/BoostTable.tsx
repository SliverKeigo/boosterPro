'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Plus,
  Upload,
  Download,
  MoreHorizontal,
  Search,
  Filter,
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
  X,
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
  /** 是否可作为筛选字段，默认 true */
  filterable?: boolean
  /** 筛选控件类型；不传则按 key 名 / 取值自动推断 */
  filterType?: 'text' | 'date' | 'select' | 'number'
  /** 当 filterType 为 select 时的候选项；不传则取该列在当前 data 中出现过的去重值 */
  filterOptions?: { label: string; value: string }[]
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

// ── 筛选相关类型与工具 ──
type FilterKind = 'text' | 'date' | 'number' | 'select'
type LogicOp = 'and' | 'or'
type FilterOp =
  | 'contains' // 文本：包含
  | 'eq' // 等于
  | 'neq' // 不等于
  | 'before' // 日期：早于
  | 'after' // 日期：晚于
  | 'gt' // 数字：大于
  | 'lt' // 数字：小于
  | 'in' // 等于任意（多选）

interface FilterCondition {
  /** 行内唯一标识 */
  id: number
  /** 与上一条的逻辑连接（首条忽略） */
  logic: LogicOp
  /** 对应列的 key */
  field: string
  op: FilterOp
  /** 单值（文本 / 日期 / 数字）输入 */
  value: string
  /** "等于任意" 的多选值 */
  values: string[]
}

/** 取值后去重选项的上限 */
const SELECT_OPTION_LIMIT = 100
/** 自动推断为 select（分类字段）的去重值数量上限 */
const SELECT_INFER_LIMIT = 20
/** 从数据推断类型时最多采样的非空值数量 */
const INFER_SAMPLE_LIMIT = 200

/** 各类型可用的运算符（label 用于下拉显示） */
const OP_LABELS: Record<FilterKind, { value: FilterOp; label: string }[]> = {
  text: [
    { value: 'contains', label: '包含' },
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
  ],
  select: [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'in', label: '等于任意' },
  ],
  date: [
    { value: 'eq', label: '等于' },
    { value: 'before', label: '早于' },
    { value: 'after', label: '晚于' },
  ],
  number: [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'gt', label: '大于' },
    { value: 'lt', label: '小于' },
  ],
}

/** 把任意取值规整为可比较 / 展示的字符串 */
function toStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

/** 看起来像日期（yyyy-mm-dd 开头的 ISO 串，或可被 Date 解析的字符串） */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/
function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return !isNaN(v.getTime())
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s) return false
  if (ISO_DATE_RE.test(s)) return true
  // 仅当含日期分隔符时再尝试 Date 解析，避免把纯数字 / 普通文本误判为日期
  if (!/[-/T:]/.test(s)) return false
  return !isNaN(Date.parse(s))
}

/** 看起来像数字（数字本身，或能被完整解析为数字的字符串） */
function looksLikeNumber(v: unknown): boolean {
  if (typeof v === 'number') return !isNaN(v)
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s) return false
  return !isNaN(Number(s))
}

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
  /** 已生效的筛选条件（驱动管线） */
  const [conditions, setConditions] = useState<FilterCondition[]>([])
  /** 面板内正在编辑的草稿条件 */
  const [draft, setDraft] = useState<FilterCondition[]>([])
  const condId = useRef(0)

  const accessorOf = (col: BoostColumn<T>) =>
    col.accessor ?? ((r: T) => (r as any)[col.key])

  // 可筛选列
  const filterableColumns = useMemo(
    () => columns.filter((c) => c.filterable !== false),
    [columns],
  )

  // 推断某列的筛选类型：① 显式 filterType 优先；② 否则按当前 data 的样本值推断。
  // 用 data + columns 记忆化，避免每次渲染都重新扫描全表。
  const kindByKey = useMemo(() => {
    const m = new Map<string, FilterKind>()
    for (const col of columns) {
      // ① 显式配置优先（向后兼容）
      if (
        col.filterType === 'date' ||
        col.filterType === 'number' ||
        col.filterType === 'select' ||
        col.filterType === 'text'
      ) {
        m.set(col.key, col.filterType)
        continue
      }
      // ② 从数据自动推断：采样该列非空样本值
      const acc = col.accessor ?? ((r: T) => (r as any)[col.key])
      const distinct = new Set<string>()
      let sampled = 0
      let dateHits = 0
      let allNumber = true
      for (const row of data) {
        const raw = acc(row)
        const s = toStr(raw).trim()
        if (!s) continue
        sampled++
        distinct.add(s)
        if (looksLikeDate(raw)) dateHits++
        if (!looksLikeNumber(raw)) allNumber = false
        if (sampled >= INFER_SAMPLE_LIMIT) break
      }
      let kind: FilterKind
      if (sampled === 0) {
        kind = 'text'
      } else if (dateHits / sampled >= 0.5) {
        // 多数样本是日期 → date（覆盖 deadline / followDate 等不含 date 字样的列）
        kind = 'date'
      } else if (allNumber) {
        kind = 'number'
      } else if (distinct.size <= SELECT_INFER_LIMIT) {
        // 去重后非空值较少 → 分类字段（提交人 / 所属行业 / 状态 / 性别…）
        kind = 'select'
      } else {
        kind = 'text'
      }
      m.set(col.key, kind)
    }
    return m
  }, [columns, data])

  const kindOf = (col: BoostColumn<T>): FilterKind => kindByKey.get(col.key) ?? 'text'

  // 某列在当前 data 中出现过的去重值（用于 select / "等于任意"）：
  // 优先用页面提供的 filterOptions；否则取 accessor 值、转字符串、去空、排序、限量。
  const optionsOf = (col: BoostColumn<T>): { label: string; value: string }[] => {
    if (col.filterOptions) return col.filterOptions
    const acc = accessorOf(col)
    const seen = new Set<string>()
    for (const row of data) {
      const s = toStr(acc(row)).trim()
      if (s) seen.add(s)
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      .slice(0, SELECT_OPTION_LIMIT)
      .map((s) => ({ label: s, value: s }))
  }

  const newCondition = (logic: LogicOp): FilterCondition => {
    const col = filterableColumns[0]
    const field = col?.key ?? ''
    const op = col ? OP_LABELS[kindOf(col)][0].value : 'contains'
    return { id: condId.current++, logic, field, op, value: '', values: [] }
  }

  // 多条件筛选：先按生效条件过滤，再进全字段搜索
  const colByKey = useMemo(() => {
    const m = new Map<string, BoostColumn<T>>()
    columns.forEach((c) => m.set(c.key, c))
    return m
  }, [columns])

  const conditionFiltered = useMemo(() => {
    // 仅保留"有效"条件：字段存在 + 值已填
    const active = conditions.filter((c) => {
      if (!colByKey.has(c.field)) return false
      if (c.op === 'in') return c.values.length > 0
      return c.value.trim() !== ''
    })
    if (active.length === 0) return data

    const evalOne = (cond: FilterCondition, row: T): boolean => {
      const col = colByKey.get(cond.field)
      if (!col) return true
      const raw = (col.accessor ?? ((r: T) => (r as any)[cond.field]))(row)
      const kind = kindOf(col)
      const cell = toStr(raw)

      switch (cond.op) {
        case 'in': // select：值 ∈ 选中集合
          return cond.values.includes(cell)
        case 'contains': // text：子串
          return cell.toLowerCase().includes(cond.value.trim().toLowerCase())
        case 'eq': // 全等（number 按数值、date 按 yyyy-mm-dd、其余按字符串）
          if (kind === 'number') return Number(cell) === Number(cond.value)
          if (kind === 'date') return cell.slice(0, 10) === cond.value.slice(0, 10)
          return cell === cond.value
        case 'neq':
          if (kind === 'number') return Number(cell) !== Number(cond.value)
          return cell !== cond.value
        case 'before': // 日期早于
          return cell.slice(0, 10) < cond.value.slice(0, 10)
        case 'after': // 日期晚于
          return cell.slice(0, 10) > cond.value.slice(0, 10)
        case 'lt': // 数字小于
          return Number(cell) < Number(cond.value)
        case 'gt': // 数字大于
          return Number(cell) > Number(cond.value)
        default:
          return true
      }
    }

    return data.filter((row) => {
      // 从左到右按各条件自身的 and/or 归并；首条 logic 忽略
      let acc = evalOne(active[0], row)
      for (let i = 1; i < active.length; i++) {
        const r = evalOne(active[i], row)
        acc = active[i].logic === 'or' ? acc || r : acc && r
      }
      return acc
    })
    // kindOf 依赖 columns（已通过 colByKey）；显式列出主要依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, conditions, colByKey])

  // 全字段模糊搜索
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conditionFiltered
    return conditionFiltered.filter((row) => {
      const parts: string[] = []
      flatten(row, parts)
      return parts.join(' ').toLowerCase().includes(q)
    })
  }, [conditionFiltered, search])

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

  // ── 筛选面板操作 ──
  // 打开面板时把已生效条件载入草稿；若没有则给一行空条件
  const initDraft = () => {
    if (conditions.length > 0) {
      setDraft(conditions.map((c) => ({ ...c, values: [...c.values] })))
    } else {
      setDraft(filterableColumns.length > 0 ? [newCondition('and')] : [])
    }
  }

  const patchRow = (id: number, patch: Partial<FilterCondition>) =>
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // 切换字段时重置运算符与值（保持类型合法）
  const changeField = (id: number, field: string) => {
    const col = colByKey.get(field)
    const ops = col ? OP_LABELS[kindOf(col)] : OP_LABELS.text
    patchRow(id, { field, op: ops[0].value, value: '', values: [] })
  }

  const changeOp = (id: number, op: FilterOp) =>
    patchRow(id, { op, value: '', values: [] })

  const addRow = () => setDraft((rows) => [...rows, newCondition('and')])

  const removeRow = (id: number) =>
    setDraft((rows) => rows.filter((r) => r.id !== id))

  // 清空所有条件的值（保留行结构）
  const clearValues = () =>
    setDraft((rows) => rows.map((r) => ({ ...r, value: '', values: [] })))

  // 应用：写入生效条件并回到第一页
  const applyFilters = (close: () => void) => {
    setConditions(draft.map((c) => ({ ...c, values: [...c.values] })))
    setPage(1)
    close()
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

  // 已生效（有值）的条件数 → 决定"筛选"按钮高亮 / 徽标
  const activeFilterCount = conditions.filter((c) => {
    if (!colByKey.has(c.field)) return false
    return c.op === 'in' ? c.values.length > 0 : c.value.trim() !== ''
  }).length

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

        {/* 筛选 */}
        {filterableColumns.length > 0 && (
          <Dropdown
            width={600}
            trigger={
              <span
                className={`${ICON_BTN} relative ${
                  activeFilterCount > 0 ? 'text-primary' : ''
                }`}
                onMouseDown={initDraft}
              >
                <Filter className="h-4 w-4" />
                筛选
                {activeFilterCount > 0 && (
                  <span className="badge badge-primary badge-xs ml-0.5">
                    {activeFilterCount}
                  </span>
                )}
              </span>
            }
          >
            {(close) => (
              <div className="flex flex-col gap-2 p-1">
                <div className="px-1 py-0.5 text-xs font-semibold text-base-content/50">
                  设置筛选条件（满足条件的行才显示）
                </div>

                {draft.length === 0 ? (
                  <div className="px-1 py-4 text-center text-sm text-base-content/40">
                    暂无条件，点击下方“添加筛选条件”
                  </div>
                ) : (
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-0.5">
                    {draft.map((cond, idx) => {
                      const col = colByKey.get(cond.field)
                      const kind = col ? kindOf(col) : 'text'
                      const ops = OP_LABELS[kind]
                      const opts = cond.op === 'in' && col ? optionsOf(col) : []
                      return (
                        <div key={cond.id} className="flex flex-col gap-1">
                          {/* 紧凑单行：逻辑 · 字段 · 运算符 · 值 · 删除 */}
                          <div className="flex flex-nowrap items-center gap-1.5">
                            {/* 行首：当 / 且·或 */}
                            {idx === 0 ? (
                              <span className="w-12 shrink-0 text-center text-sm text-base-content/60">
                                当
                              </span>
                            ) : (
                              <select
                                className="select select-bordered select-sm w-12 shrink-0 px-1"
                                value={cond.logic}
                                onChange={(e) =>
                                  patchRow(cond.id, {
                                    logic: e.target.value as LogicOp,
                                  })
                                }
                              >
                                <option value="and">且</option>
                                <option value="or">或</option>
                              </select>
                            )}

                            {/* 字段 */}
                            <select
                              className="select select-bordered select-sm w-[120px] shrink-0"
                              value={cond.field}
                              onChange={(e) => changeField(cond.id, e.target.value)}
                            >
                              {filterableColumns.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.title}
                                </option>
                              ))}
                            </select>

                            {/* 运算符 */}
                            <select
                              className="select select-bordered select-sm w-[110px] shrink-0"
                              value={cond.op}
                              onChange={(e) =>
                                changeOp(cond.id, e.target.value as FilterOp)
                              }
                            >
                              {ops.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>

                            {/* 值控件：随 kind 自动切换，占满剩余宽度 */}
                            {cond.op === 'in' ? (
                              <span className="min-w-0 flex-1 truncate text-xs text-base-content/50">
                                {cond.values.length > 0
                                  ? `已选 ${cond.values.length} 项（下方勾选）`
                                  : '请在下方勾选要匹配的值'}
                              </span>
                            ) : kind === 'select' ? (
                              <select
                                className="select select-bordered select-sm min-w-0 flex-1"
                                value={cond.value}
                                onChange={(e) =>
                                  patchRow(cond.id, { value: e.target.value })
                                }
                              >
                                <option value="" disabled hidden>
                                  请选择
                                </option>
                                {(col ? optionsOf(col) : []).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : kind === 'date' ? (
                              <input
                                type="date"
                                className="input input-bordered input-sm min-w-0 flex-1"
                                value={cond.value}
                                onChange={(e) =>
                                  patchRow(cond.id, { value: e.target.value })
                                }
                              />
                            ) : (
                              <input
                                type={kind === 'number' ? 'number' : 'text'}
                                className="input input-bordered input-sm min-w-0 flex-1"
                                placeholder="输入值"
                                value={cond.value}
                                onChange={(e) =>
                                  patchRow(cond.id, { value: e.target.value })
                                }
                              />
                            )}

                            {/* 删除行 */}
                            <button
                              type="button"
                              aria-label="删除条件"
                              className="btn btn-ghost btn-sm btn-square shrink-0 text-base-content/50 hover:text-error"
                              onClick={() => removeRow(cond.id)}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* “等于任意”多选：在该行下方展开 */}
                          {cond.op === 'in' && (
                            <div className="ml-[54px] flex flex-col gap-1 rounded-lg border border-base-300 bg-base-200/40 p-1.5">
                              <div className="px-0.5 text-xs text-base-content/50">
                                {cond.values.length > 0
                                  ? `已选 ${cond.values.length} 项`
                                  : '勾选要匹配的值（任一命中即可）'}
                              </div>
                              <div className="grid max-h-40 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto">
                                {opts.length > 0 ? (
                                  opts.map((o) => (
                                    <label
                                      key={o.value}
                                      className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-base-200"
                                    >
                                      <input
                                        type="checkbox"
                                        className="checkbox checkbox-xs checkbox-primary"
                                        checked={cond.values.includes(o.value)}
                                        onChange={(e) =>
                                          patchRow(cond.id, {
                                            values: e.target.checked
                                              ? [...cond.values, o.value]
                                              : cond.values.filter(
                                                  (v) => v !== o.value,
                                                ),
                                          })
                                        }
                                      />
                                      <span className="truncate text-xs">
                                        {o.label}
                                      </span>
                                    </label>
                                  ))
                                ) : (
                                  <div className="col-span-2 px-1 py-2 text-center text-xs text-base-content/40">
                                    无可选值
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 底部操作 */}
                <div className="flex items-center justify-between gap-2 border-t border-base-300 pt-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gap-1 text-primary"
                    onClick={addRow}
                  >
                    <Plus className="h-4 w-4" />
                    添加筛选条件
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={clearValues}
                    >
                      清空值
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => applyFilters(close)}
                    >
                      筛选
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Dropdown>
        )}

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
