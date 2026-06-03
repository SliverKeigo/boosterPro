'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { exportToExcel } from '@/lib/exportExcel'

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
  /** 导出 Excel 时的取值；不传则用 accessor（适合 render 与原始值不同的列，如状态码 → 中文） */
  exportValue?: (record: T) => unknown
}

interface MoreAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

interface BoostTableProps<T> {
  title?: string
  /** 列显示状态持久化的存储键；不传则回退到 title，二者皆空时不持久化 */
  storageKey?: string
  columns: BoostColumn<T>[]
  data: T[]
  loading?: boolean
  rowKey?: keyof T | ((r: T) => string | number)
  onCreate?: () => void
  createText?: string
  onImport?: () => void
  /** 不传则使用内置 Excel 导出（.xlsx，按可见列 + 当前筛选/排序结果） */
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

// 导入功能暂时下线：置 false 时所有列表都不渲染「导入」按钮（恢复时改回 true）
const IMPORT_ENABLED = false

const ICON_BTN =
  'btn btn-ghost btn-sm gap-1.5 font-medium text-base-content/70 hover:text-base-content'

// 原始主键 / 外键 ID 列（key 为 'id' 或以 'Id' 结尾，如 customerId/submitterId/requirementId）
// 对用户无意义（表格展示对应的名称列即可）：统一从 显示列 / 排序 / 筛选 / 实际渲染 中排除。
const isIdColumnKey = (key: string) => key === 'id' || /Id$/.test(key)

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

// ── 多字段排序：一条规则 = 一个排序字段 + 方向 ──
type SortDir = 'asc' | 'desc'
interface SortRule {
  /** 行内唯一标识（用于 React key / 增删行定位） */
  id: number
  /** 对应可排序列的 key */
  field: string
  /** 升序 / 降序 */
  dir: SortDir
}

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
  storageKey,
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
  /** 已生效的排序规则（驱动排序管线）；为空数组时保持数据原始（API 默认）顺序 */
  const [sortRules, setSortRules] = useState<SortRule[]>([])
  /** 排序面板内正在编辑的草稿规则 */
  const [sortDraft, setSortDraft] = useState<SortRule[]>([])
  const sortId = useRef(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)
  const [fullscreen, setFullscreen] = useState(false)
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = Object.fromEntries(
      columns.map((c) => [c.key, c.defaultVisible !== false]),
    )
    // 初始化即同步读入持久化的列显示配置：visible 一开始就是正确值，
    // 避免「异步载入」与「保存 effect」竞争导致客户端路由切换时被默认值覆盖。
    const key = storageKey ?? title
    if (key && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('bp:cols:' + key)
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, boolean>
          for (const c of columns) if (typeof saved[c.key] === 'boolean') defaults[c.key] = saved[c.key]
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    return defaults
  })

  // 列显示变更时写回（visible 初始化时已读入，故无需载入 effect 与 loadedRef 守卫）
  useEffect(() => {
    const key = storageKey ?? title
    if (!key || typeof window === 'undefined') return
    try {
      window.localStorage.setItem('bp:cols:' + key, JSON.stringify(visible))
    } catch {
      /* ignore quota errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  /** 已生效的筛选条件（驱动管线） */
  const [conditions, setConditions] = useState<FilterCondition[]>([])
  /** 面板内正在编辑的草稿条件 */
  const [draft, setDraft] = useState<FilterCondition[]>([])
  const condId = useRef(0)

  const accessorOf = (col: BoostColumn<T>) =>
    col.accessor ?? ((r: T) => (r as any)[col.key])

  // 可筛选列
  const filterableColumns = useMemo(
    () =>
      columns.filter((c) => {
        if (c.filterable === false) return false
        if (c.filterable === true) return true // 显式开启，覆盖下面的默认排除
        // 默认排除对筛选无意义的技术列：主键 / 外键 id（如 customerId）、URL / 文件链接列
        if (isIdColumnKey(c.key)) return false
        if (/Url$/i.test(c.key)) return false
        return true
      }),
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
      let sampled = 0
      let dateHits = 0
      let allNumber = true
      for (const row of data) {
        const raw = acc(row)
        const s = toStr(raw).trim()
        if (!s) continue
        sampled++
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
      } else {
        // 不再按「数据去重值少」自动判为下拉：select 必须由列显式 filterType:'select' + filterOptions 指定(对齐表单)
        kind = 'text'
      }
      m.set(col.key, kind)
    }
    return m
  }, [columns, data])

  const kindOf = (col: BoostColumn<T>): FilterKind => kindByKey.get(col.key) ?? 'text'

  // select 候选项只来自列显式 filterOptions（对齐表单），不从列表数据现取
  const optionsOf = (col: BoostColumn<T>): { label: string; value: string }[] =>
    col.filterOptions ?? []

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

  // 排序：按 sortRules 顺序做稳定多关键字排序（第一条为主、依次 tie-break）；
  // 无规则时返回 filtered（保持数据来自 API 的默认顺序）。
  const sorted = useMemo(() => {
    // 仅保留字段仍存在的有效规则
    const active = sortRules
      .map((rule) => {
        const col = columns.find((c) => c.key === rule.field)
        return col ? { acc: accessorOf(col), dir: rule.dir } : null
      })
      .filter((r): r is { acc: (record: T) => unknown; dir: SortDir } => r !== null)
    if (active.length === 0) return filtered
    // Array.prototype.sort 自 ES2019 起保证稳定，无规则差时维持原顺序
    const arr = [...filtered]
    arr.sort((a, b) => {
      for (const { acc, dir } of active) {
        const va = acc(a)
        const vb = acc(b)
        let cmp: number
        // 取值 / 比较方式与原单字段排序保持一致：null 垫底、数字按数值、其余 localeCompare('zh-CN')
        if (va == null && vb == null) cmp = 0
        else if (va == null) cmp = 1
        else if (vb == null) cmp = -1
        else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
        else cmp = String(va).localeCompare(String(vb), 'zh-CN')
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortRules, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pageCount)
  const paged = useMemo(
    () => sorted.slice((current - 1) * size, current * size),
    [sorted, current, size],
  )

  const visibleColumns = columns.filter((c) => visible[c.key] && !isIdColumnKey(c.key))

  const getKey = (r: T, i: number): string | number => {
    if (typeof rowKey === 'function') return rowKey(r)
    return (r as any)[rowKey] ?? i
  }

  // 表头点击排序：把排序规则设为「仅该字段」并在 asc → desc → 无 间循环。
  // 与排序面板共享同一份 sortRules，不存在两套互相打架。
  const toggleSort = (key: string) => {
    setSortRules((rules) => {
      // 当前是否「仅按该字段」排序（单条规则且字段匹配）
      const only = rules.length === 1 && rules[0].field === key
      if (!only) return [{ id: sortId.current++, field: key, dir: 'asc' }]
      if (rules[0].dir === 'asc')
        return [{ ...rules[0], dir: 'desc' }]
      return []
    })
    setPage(1)
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

  // 全局连接符：整组只有一个「且 / 或」(在第 2 个条件上选择)，决定所有条件统一为「且」或「或」，
  // 不支持逐条混用——与原系统一致。改第 2 条即同步到全部条件。
  const setGroupLogic = (logic: LogicOp) =>
    setDraft((rows) => rows.map((r) => ({ ...r, logic })))

  // 切换字段时重置运算符与值（保持类型合法）
  const changeField = (id: number, field: string) => {
    const col = colByKey.get(field)
    const ops = col ? OP_LABELS[kindOf(col)] : OP_LABELS.text
    patchRow(id, { field, op: ops[0].value, value: '', values: [] })
  }

  const changeOp = (id: number, op: FilterOp) =>
    patchRow(id, { op, value: '', values: [] })

  // 新增条件沿用「全局连接符」(第 2 条的 logic)；还没有第 2 条时默认「且」
  const addRow = () => setDraft((rows) => [...rows, newCondition(rows[1]?.logic ?? 'and')])

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

  const doExport = (rows: T[]) =>
    exportToExcel({
      title: title || '导出',
      columns: visibleColumns.map((c) => ({
        header: c.title,
        getValue: c.exportValue ?? accessorOf(c),
      })),
      rows,
    })

  const sortableColumns = columns.filter((c) => c.sortable !== false && !isIdColumnKey(c.key))

  // ── 排序面板操作（草稿 → 应用，与筛选面板同一交互模式）──
  const newSortRule = (): SortRule => ({
    id: sortId.current++,
    field: sortableColumns[0]?.key ?? '',
    dir: 'asc',
  })

  // 打开面板时把已生效规则载入草稿；若没有则给一行默认规则
  const initSortDraft = () => {
    if (sortRules.length > 0) {
      setSortDraft(sortRules.map((r) => ({ ...r })))
    } else {
      setSortDraft(sortableColumns.length > 0 ? [newSortRule()] : [])
    }
  }

  const patchSortRow = (id: number, patch: Partial<SortRule>) =>
    setSortDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const addSortRow = () => setSortDraft((rows) => [...rows, newSortRule()])

  const removeSortRow = (id: number) =>
    setSortDraft((rows) => rows.filter((r) => r.id !== id))

  // 清空：清掉所有规则（草稿置空）
  const clearSortDraft = () => setSortDraft([])

  // 应用：写入生效规则并回到第一页（仅保留字段非空的规则）
  const applySort = (close: () => void) => {
    setSortRules(sortDraft.filter((r) => r.field).map((r) => ({ ...r })))
    setPage(1)
    close()
  }

  // 已生效的排序规则数 → 决定"排序"按钮高亮 / 徽标
  const activeSortCount = sortRules.filter((r) =>
    sortableColumns.some((c) => c.key === r.field),
  ).length

  // 字段 → 已生效方向，供表头排序指示复用（同一份 sortRules）。
  // 同字段多条规则时以第一条为准（表头点击只会产生单条规则，正常不会出现）。
  const sortDirByKey = useMemo(() => {
    const m = new Map<string, SortDir>()
    for (const r of sortRules) if (!m.has(r.field)) m.set(r.field, r.dir)
    return m
  }, [sortRules])

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
        {IMPORT_ENABLED && onImport && (
          <button type="button" className={ICON_BTN} onClick={onImport}>
            <Upload className="h-4 w-4" />
            导入
          </button>
        )}
        {showExport &&
          (onExport ? (
            <button type="button" className={ICON_BTN} onClick={onExport}>
              <Download className="h-4 w-4" />
              导出
            </button>
          ) : (
            <Dropdown
              width={170}
              align="left"
              trigger={
                <span className={ICON_BTN}>
                  <Download className="h-4 w-4" />
                  导出
                </span>
              }
            >
              {(close) => (
                <ul className="menu menu-sm w-full p-0">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        void doExport(paged)
                      }}
                    >
                      导出当页
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        void doExport(sorted)
                      }}
                    >
                      导出全部（共 {sorted.length} 条）
                    </button>
                  </li>
                </ul>
              )}
            </Dropdown>
          ))}
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
                            ) : idx === 1 ? (
                              // 第 2 条：可改的「全局连接符」，改动同步到后续所有条件
                              <select
                                className="select select-bordered select-sm w-12 shrink-0 px-1"
                                value={cond.logic}
                                onChange={(e) => setGroupLogic(e.target.value as LogicOp)}
                              >
                                <option value="and">且</option>
                                <option value="or">或</option>
                              </select>
                            ) : (
                              // 第 3 条起：沿用第 2 条的连接符，只读展示（不可单独修改）
                              <select
                                className="select select-bordered select-sm w-12 shrink-0 px-1"
                                value={cond.logic}
                                disabled
                                title="连接符由第 2 个条件统一控制"
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
            {columns.filter((c) => !isIdColumnKey(c.key)).map((c) => (
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
        {sortableColumns.length > 0 && (
          <Dropdown
            width={380}
            trigger={
              <span
                className={`${ICON_BTN} relative ${
                  activeSortCount > 0 ? 'text-primary' : ''
                }`}
                onMouseDown={initSortDraft}
              >
                <ArrowUpDown className="h-4 w-4" />
                排序
                {activeSortCount > 0 && (
                  <span className="badge badge-primary badge-xs ml-0.5">
                    {activeSortCount}
                  </span>
                )}
              </span>
            }
          >
            {(close) => (
              <div className="flex flex-col gap-2 p-1">
                <div className="px-1 py-0.5 text-xs font-semibold text-base-content/50">
                  设置排序规则（按从上到下的顺序依次排序）
                </div>

                {sortDraft.length === 0 ? (
                  <div className="px-1 py-4 text-center text-sm text-base-content/40">
                    暂无排序规则，点击下方“添加排序规则”
                  </div>
                ) : (
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-0.5">
                    {sortDraft.map((rule, idx) => (
                      <div
                        key={rule.id}
                        className="flex flex-nowrap items-center gap-1.5"
                      >
                        {/* 行首：主序 / 次序提示 */}
                        <span className="w-12 shrink-0 text-center text-sm text-base-content/60">
                          {idx === 0 ? '排序' : '其次'}
                        </span>

                        {/* 排序字段 */}
                        <select
                          className="select select-bordered select-sm min-w-0 flex-1"
                          value={rule.field}
                          onChange={(e) =>
                            patchSortRow(rule.id, { field: e.target.value })
                          }
                        >
                          {sortableColumns.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.title}
                            </option>
                          ))}
                        </select>

                        {/* 升序 / 降序 单选 */}
                        <div className="join shrink-0">
                          <button
                            type="button"
                            className={`btn btn-sm join-item gap-1 ${
                              rule.dir === 'asc' ? 'btn-primary' : 'btn-ghost'
                            }`}
                            onClick={() => patchSortRow(rule.id, { dir: 'asc' })}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                            升序
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm join-item gap-1 ${
                              rule.dir === 'desc' ? 'btn-primary' : 'btn-ghost'
                            }`}
                            onClick={() => patchSortRow(rule.id, { dir: 'desc' })}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                            降序
                          </button>
                        </div>

                        {/* 删除该行 */}
                        <button
                          type="button"
                          aria-label="删除排序规则"
                          className="btn btn-ghost btn-sm btn-square shrink-0 text-base-content/50 hover:text-error"
                          onClick={() => removeSortRow(rule.id)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 底部操作 */}
                <div className="flex items-center justify-between gap-2 border-t border-base-300 pt-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gap-1 text-primary"
                    onClick={addSortRow}
                  >
                    <Plus className="h-4 w-4" />
                    添加排序规则
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={clearSortDraft}
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => applySort(close)}
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Dropdown>
        )}

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
                  // 该列在已生效排序规则中的方向（与排序面板共享同一份 sortRules）
                  const dir = sortDirByKey.get(c.key)
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
                          (dir ? (
                            dir === 'asc' ? (
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
