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
  Trash2,
} from 'lucide-react'
import { Dropdown } from './Dropdown'
import { Popconfirm } from './Popconfirm'
import { useToast } from './Toast'
import { Modal } from './Modal'
import { exportToExcel } from '@/lib/exportExcel'
import { IMPORT_COLUMNS, markRequired } from '@/lib/importColumns'
import { ImportModal } from './ImportModal'
import { useMyPermissions } from '@/lib/usePermissions'

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
  /** 该列为多值（accessor 输出空格分隔的多个值，如 status text[]）；select 的「在…中」按拆词后任一命中匹配 */
  multiValue?: boolean
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
  /** 传入资源 key（如 'TALENT_POOL'）即开启「可回导」导出 + 导入：导出含 id/关系名/子表文本、导入走 /api/import/<resource> */
  importResource?: string
  /** 自定义导入端点（覆盖 /api/import/<resource>，如工作计划 /api/work-plans/import）。配合自定义 onExport 用 */
  importEndpoint?: string
  /** 不传则使用内置 Excel 导出（.xlsx，按可见列 + 当前筛选/排序结果） */
  onExport?: () => void
  /** 是否显示导出按钮（受导出权限控制），默认 true */
  showExport?: boolean
  onRefresh?: () => void
  /** 传入删除端点（如 '/api/candidates'）即开启「多选 + 批量删除」：勾选行后批量 DELETE `${deleteEndpoint}/${key}` */
  deleteEndpoint?: string
  /** 哪些行可被勾选删除（默认全部可选）；业务列表传 isOwner、系统管理传 isAdmin */
  canSelectRow?: (record: T) => boolean
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

// 每页条数可选档位（下拉白名单）；持久化读取时只接受此集合内的值，防止脏数据。
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

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
  importResource,
  importEndpoint,
  onExport,
  showExport = true,
  onRefresh,
  deleteEndpoint,
  canSelectRow,
  moreActions,
  actions,
  actionsWidth = 140,
  pageSize = 25,
  searchPlaceholder = '搜索全部字段…',
  extraToolbar,
  emptyText = '暂无数据',
}: BoostTableProps<T>) {
  const [search, setSearch] = useState('')
  // 导入弹窗开关（importResource 提供时启用）
  const [importOpen, setImportOpen] = useState(false)
  /** 已生效的排序规则（驱动排序管线）；为空数组时保持数据原始（API 默认）顺序 */
  const [sortRules, setSortRules] = useState<SortRule[]>([])
  /** 排序面板内正在编辑的草稿规则 */
  const [sortDraft, setSortDraft] = useState<SortRule[]>([])
  const sortId = useRef(0)
  const [page, setPage] = useState(1)
  // ── 个人偏好持久化（每页条数 / 显示列 / 筛选）：按【登录用户】隔离 ──
  // key 形如 bp:cols:v2:u<userId>:<storageKey|title>。带上 userId 后：同一浏览器多账号
  // 各存各的、互不串；uid 未就绪(perm 异步加载中)时 prefKey 返回 null → 暂不读写，
  // 待 perm 到位后由下方「补载 effect」从正确的 key 重新载入（覆盖首渲染的默认值）。
  // 注：仍是浏览器 localStorage，不跨设备跟随——跨设备需后端存偏好（暂未做）。
  const { perm } = useMyPermissions()
  const prefKey = (prefix: string): string | null => {
    const base = storageKey ?? title
    const uid = perm?.userId
    return base && uid != null ? `${prefix}u${uid}:${base}` : null
  }
  const readSize = (): number => {
    const k = prefKey('bp:pageSize:')
    if (k && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(k)
        if (raw != null) {
          const n = Number(raw)
          if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    return pageSize
  }
  const readVisible = (): Record<string, boolean> => {
    const defaults: Record<string, boolean> = Object.fromEntries(columns.map((c) => [c.key, true]))
    const k = prefKey('bp:cols:v2:')
    if (k && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(k)
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, boolean>
          for (const c of columns) if (typeof saved[c.key] === 'boolean') defaults[c.key] = saved[c.key]
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    return defaults
  }
  const readConditions = (): FilterCondition[] => {
    const k = prefKey('bp:filters:')
    if (k && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(k)
        if (raw) {
          const saved: unknown = JSON.parse(raw)
          if (Array.isArray(saved)) {
            const OPS: readonly FilterOp[] = ['contains', 'eq', 'neq', 'before', 'after', 'gt', 'lt', 'in']
            return saved
              .filter(
                (c: any) =>
                  c &&
                  typeof c.field === 'string' &&
                  columns.some((col) => col.key === c.field) &&
                  OPS.includes(c.op) &&
                  typeof c.value === 'string' &&
                  Array.isArray(c.values) &&
                  c.values.every((v: any) => typeof v === 'string'),
              )
              .map((c: any, i: number): FilterCondition => ({
                id: i,
                logic: c.logic === 'or' ? 'or' : 'and',
                field: c.field,
                op: c.op,
                value: c.value,
                values: c.values,
              }))
          }
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    return []
  }

  // 每页条数：初始化即读入持久化值（白名单校验），下次进入沿用上次选择。
  const [size, setSize] = useState<number>(readSize)
  // 每页条数变更时写回（uid 未就绪→prefKey null→跳过，避免污染匿名 key）
  useEffect(() => {
    const k = prefKey('bp:pageSize:')
    if (!k || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(k, String(size))
    } catch {
      /* ignore quota errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])
  const [fullscreen, setFullscreen] = useState(false)
  // 「显示列」弹窗开关（内部 state 控制，不改对外 props）
  const [colModalOpen, setColModalOpen] = useState(false)
  // 默认全部显示；初始化即读入该用户持久化的列显示配置（readVisible 内含默认全 true + 覆盖）
  const [visible, setVisible] = useState<Record<string, boolean>>(readVisible)

  // 列显示变更时写回
  useEffect(() => {
    const k = prefKey('bp:cols:v2:')
    if (!k || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(k, JSON.stringify(visible))
    } catch {
      /* ignore quota errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  /** 已生效的筛选条件（驱动管线）；初始化即读入该用户持久化值——下次进入沿用上次筛选 */
  const [conditions, setConditions] = useState<FilterCondition[]>(readConditions)
  /** 面板内正在编辑的草稿条件 */
  const [draft, setDraft] = useState<FilterCondition[]>([])
  // 计数器从已恢复条数起步，避免与恢复条件的 id（0..n-1）冲突
  const condId = useRef(conditions.length)

  // 筛选条件变更时写回
  useEffect(() => {
    const k = prefKey('bp:filters:')
    if (!k || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(k, JSON.stringify(conditions))
    } catch {
      /* ignore quota errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions])

  // 补载：perm 异步加载中挂载时(首渲染 uid=null，三项用了默认值)，待 userId 就绪/切换后
  // 从该用户的 key 重新载入三项偏好，覆盖默认值。loadedUidRef 确保仅在 uid 真正变化时执行一次，
  // 避免与上面三个「变更写回」effect 互相触发。
  const loadedUidRef = useRef<number | null | undefined>(perm?.userId)
  useEffect(() => {
    const uid = perm?.userId
    if (uid == null || uid === loadedUidRef.current) return
    loadedUidRef.current = uid
    setSize(readSize())
    setVisible(readVisible())
    setConditions(readConditions())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perm?.userId])

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
  // 多值列（如 status）默认用「等于任意」(in)——单值「等于」精确匹配整串、匹配不到多状态行
  const defaultOpFor = (col: BoostColumn<T>): FilterOp =>
    col.multiValue ? 'in' : OP_LABELS[kindOf(col)][0].value

  // select 候选项只来自列显式 filterOptions（对齐表单），不从列表数据现取
  const optionsOf = (col: BoostColumn<T>): { label: string; value: string }[] =>
    col.filterOptions ?? []

  const newCondition = (logic: LogicOp): FilterCondition => {
    const col = filterableColumns[0]
    const field = col?.key ?? ''
    const op = col ? defaultOpFor(col) : 'contains'
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

      // 多值列（accessor 输出空格分隔，如 status text[]）：等于/不等于/等于任意 均按拆词命中
      if (col.multiValue && (cond.op === 'in' || cond.op === 'eq' || cond.op === 'neq')) {
        const tokens = cell.split(/\s+/).filter(Boolean)
        if (cond.op === 'in') return cond.values.some((v) => tokens.includes(v))
        if (cond.op === 'eq') return tokens.includes(cond.value)
        return !tokens.includes(cond.value) // neq：不含该值
      }

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

  // ── 多选 + 批量删除（仅传入 deleteEndpoint 时启用）──
  const toast = useToast()
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(() => new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  // 不支持跨页勾选：翻页 / 搜索 / 筛选 / 排序 / 数据刷新使可见行变化时清空已选（勾选仅限当前页）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys((prev) => (prev.size ? new Set() : prev))
  }, [current, sorted])
  const selectable = !!deleteEndpoint
  // 当前页「可勾选」行的 key（受 canSelectRow 约束：无权删的行不可选）
  const selectablePageKeys = useMemo(() => {
    const ks: (string | number)[] = []
    paged.forEach((r, i) => { if (!canSelectRow || canSelectRow(r)) ks.push(getKey(r, i)) })
    return ks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, canSelectRow])
  const allPageSelected = selectablePageKeys.length > 0 && selectablePageKeys.every((k) => selectedKeys.has(k))
  const somePageSelected = !allPageSelected && selectablePageKeys.some((k) => selectedKeys.has(k))
  const toggleSelectAllPage = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allPageSelected) selectablePageKeys.forEach((k) => next.delete(k))
      else selectablePageKeys.forEach((k) => next.add(k))
      return next
    })
  }
  const toggleSelectRow = (key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const handleBatchDelete = async () => {
    if (!deleteEndpoint || selectedKeys.size === 0) return
    setBatchDeleting(true)
    let ok = 0
    let fail = 0
    for (const key of selectedKeys) {
      try {
        const res = await fetch(`${deleteEndpoint}/${key}`, { method: 'DELETE' })
        if (res.ok) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setBatchDeleting(false)
    setSelectedKeys(new Set())
    if (fail === 0) toast.success(`已删除 ${ok} 条`)
    else toast.error(`删除完成：成功 ${ok} 条、失败 ${fail} 条（可能无权限或被引用）`)
    onRefresh?.()
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
    patchRow(id, { field, op: col ? defaultOpFor(col) : 'contains', value: '', values: [] })
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

  // importResource 提供时，导出走「可回导」列（id + 关系名 + 子表 JSON），否则按可见列。
  const roundTripCols = importResource ? IMPORT_COLUMNS[importResource] : undefined
  const doExport = (rows: T[]) =>
    exportToExcel({
      title: title || '导出',
      columns: roundTripCols
        ? roundTripCols.map((c) => ({ ...c, header: markRequired(importResource, c.header) }))
        : visibleColumns.map((c) => ({ header: c.title, getValue: c.exportValue ?? accessorOf(c) })),
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

  // 「显示列」弹窗里可勾选的列（排除对用户无意义的 id / 外键列）
  const toggleableColumns = useMemo(
    () => columns.filter((c) => !isIdColumnKey(c.key)),
    [columns],
  )

  // 全选 / 全不选：一次性把可勾选列统一设为显示 / 隐藏
  const setAllVisible = (value: boolean) =>
    setVisible((v) => {
      const next = { ...v }
      for (const c of toggleableColumns) next[c.key] = value
      return next
    })

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
        {selectable && selectedKeys.size > 0 && (
          <Popconfirm title={`确认删除选中的 ${selectedKeys.size} 条记录？此操作不可恢复。`} onConfirm={handleBatchDelete}>
            <button type="button" className="btn btn-error btn-sm gap-1.5" disabled={batchDeleting}>
              {batchDeleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 className="h-4 w-4" />}
              删除选中（{selectedKeys.size}）
            </button>
          </Popconfirm>
        )}
        {importResource ? (
          <button type="button" className={ICON_BTN} onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            导入
          </button>
        ) : IMPORT_ENABLED && onImport ? (
          <button type="button" className={ICON_BTN} onClick={onImport}>
            <Upload className="h-4 w-4" />
            导入
          </button>
        ) : null}
        {showExport &&
          (importResource ? (
            // 可导回模块：导出为「封存包」zip（后端生成，含数据 + 附件），与导入同格式
            <button type="button" className={ICON_BTN} onClick={() => { window.location.href = `/api/export/${importResource}` }}>
              <Download className="h-4 w-4" />
              导出
            </button>
          ) : onExport ? (
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

        {/* 显示列：点按钮弹出 Modal，一次铺开全部列勾选；勾选即时生效，靠 X/遮罩/ESC 关 */}
        <button type="button" className={ICON_BTN} onClick={() => setColModalOpen(true)}>
          <Columns3 className="h-4 w-4" />
          显示列
        </button>

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
                {selectable && (
                  <th className="w-10 bg-base-200">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm align-middle"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected }}
                      onChange={toggleSelectAllPage}
                      aria-label="全选当前页"
                    />
                  </th>
                )}
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
                  {selectable && (
                    <td className="w-10">
                      {(!canSelectRow || canSelectRow(r)) && (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm align-middle"
                          checked={selectedKeys.has(getKey(r, i))}
                          onChange={() => toggleSelectRow(getKey(r, i))}
                          aria-label="选择该行"
                        />
                      )}
                    </td>
                  )}
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
                {PAGE_SIZE_OPTIONS.map((n) => (
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

      {/* 显示列设置弹窗：全部列一次铺开（多列网格），勾选即时生效，无底部按钮（footer={null}） */}
      <Modal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        title="显示列"
        width={560}
        footer={null}
      >
        <div className="flex items-center justify-between gap-2 pb-3">
          <div className="text-xs font-semibold text-base-content/50">勾选要显示的列</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setAllVisible(true)}
            >
              全选
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setAllVisible(false)}
            >
              全不选
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {toggleableColumns.map((c) => (
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
      </Modal>

      {importResource && (
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          resource={importResource}
          endpoint={importEndpoint}
          title={`导入${title || ''}`}
          onDone={onRefresh}
        />
      )}
    </div>
  )
}
