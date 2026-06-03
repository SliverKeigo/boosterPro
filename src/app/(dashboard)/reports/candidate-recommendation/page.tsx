'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BarChart3,
  PieChart as PieIcon,
  Users,
  FileText,
  ShieldAlert,
  Filter,
  RotateCcw,
} from 'lucide-react'
import { BoostTable, type BoostColumn, SearchSelect, searchFetch, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'
// 推荐状态中文 label 复用 enums.ts 单一事实源（勿另写一份）
import { RECOMMENDATION_STATUS_LABELS, RECOMMENDATION_STATUS_OPTIONS } from '@/lib/enums'

// ─── 口径常量（集中、带注释，便于以后调整） ─────────────────────────────────────

/**
 * 「无效简历」状态集合 —— 即"简历被刷掉"的状态。
 * 「有效简历」= 推荐状态 NOT IN INVALID_RESUME_STATUSES（排除以下两种简历直接被刷掉的状态）。
 * 后续若业务对"有效"定义调整，仅改这里即可。
 */
const INVALID_RESUME_STATUSES = new Set<string>([
  'RESUME_FAILED', // 简历失败
  'INTERNAL_RESUME_FAILED', // 简历(内推)失败
])
const isValidResume = (status: string) => !INVALID_RESUME_STATUSES.has(status)

/**
 * 「流程中 / 进行中」状态集合 —— 候选人正处于推进中的环节，
 * 排除各种失败 / 关闭 / 过保 / 挂起等终态。用于"个人流程中人数情况"。
 */
const IN_PROGRESS_STATUSES = [
  'INTERVIEWING', // 面试中
  'SALARY_NEGO', // 谈薪中
  'OFFERING', // Offer中
  'ONBOARDING', // 入职中
  'GUARANTEE', // 保证期
]
const IN_PROGRESS_SET = new Set<string>(IN_PROGRESS_STATUSES)

const statusLabel = (s: string) => RECOMMENDATION_STATUS_LABELS[s] ?? s

// ─── 品牌配色（与现有 reports 页一致） ───────────────────────────────────────────
const BRAND = '#0369A1'
const PALETTE = [
  '#0369A1',
  '#0EA5E9',
  '#16A34A',
  '#D97706',
  '#2563EB',
  '#0D9488',
  '#7C3AED',
  '#DC2626',
  '#65A30D',
  '#0891B2',
  '#EA580C',
  '#4F46E5',
]

// ─── 时间窗口工具（客户端组件，new Date() 可用） ─────────────────────────────────
/** 本月 [start, end) */
function thisMonthRange(now = new Date()): [Date, Date] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return [start, end]
}
/** 上月 [start, end) */
function lastMonthRange(now = new Date()): [Date, Date] {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  return [start, end]
}
/** 最近一个月 [now-1month, now]（滚动 30 天窗口的"最近1月"，按自然月回退） */
function recentMonthRange(now = new Date()): [Date, Date] {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  return [start, now]
}
/** 本年度 [Jan 1, next Jan 1) */
function thisYearRange(now = new Date()): [Date, Date] {
  return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)]
}
/** 判断 dateStr 是否落在 [start, end)（半开区间） */
function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return false
  return t >= start.getTime() && t < end.getTime()
}

// ─── 聚合工具（与现有 reports 页同款 countBy） ──────────────────────────────────
function countBy<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  labelOf: (key: string) => string = (k) => k,
): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key == null || key === '') continue
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([k, value]) => ({ name: labelOf(k), value }))
    .sort((a, b) => b.value - a.value)
}

// ─── ECharts option 构造（对齐现有 reports 页） ─────────────────────────────────
const baseTextStyle = { fontFamily: 'inherit' }

function barOption(
  data: { name: string; value: number }[],
  color: string = BRAND,
  rotate = 0,
) {
  return {
    textStyle: baseTextStyle,
    color: [color],
    grid: { left: 8, right: 16, top: 24, bottom: rotate ? 78 : 28, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisTick: { alignWithLabel: true },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#475569', interval: 0, rotate, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        barMaxWidth: 36,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: '#334155', fontSize: 11 },
      },
    ],
  }
}

function pieOption(data: { name: string; value: number }[]) {
  return {
    textStyle: baseTextStyle,
    color: PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 8,
      top: 'middle',
      textStyle: { color: '#475569', fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }
}

// ─── UI 小组件 ───────────────────────────────────────────────────────────────────
function ChartCard({
  title,
  icon: Icon,
  empty,
  children,
}: {
  title: string
  icon: any
  empty?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-base-content">{title}</h3>
      </div>
      {empty ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-base-content/40">
          暂无数据
        </div>
      ) : (
        children
      )}
    </div>
  )
}

const ECHART_STYLE = { height: 300, width: '100%' }

// 筛选条件初值
const EMPTY_FILTERS = {
  status: '', // recommendationStatus 枚举 key
  submitterId: '', // 推荐人 user id
  customerId: '', // 客户 id
  recommendStart: '', // recommendationTime 起（含）
  recommendEnd: '', // recommendationTime 止（含当天）
  planDate: '', // 计划日期（单选一日，对应 offer到岗日期 offerOnboardDate）
  channel: '', // recruitmentChannel 字典 value
}

export default function CandidateRecommendationReportPage() {
  // 权限：仅 REPORT VIEW 可看报表（与现有 reports 页一致）
  const { can, isAdmin, userId, loading: permLoading } = useMyPermissions()
  const allowed = isAdmin || can('REPORT', 'VIEW')
  const toast = useToast()

  const { items: channelOptions } = useDict('recruitment_channel')

  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<any[]>([])
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  const setFilter = (k: keyof typeof EMPTY_FILTERS, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }))
  const resetFilters = () => setFilters({ ...EMPTY_FILTERS })

  // 权限就绪且有权后再拉数据。IIFE 首句即 await，effect 同步路径不含 setState
  // （规避 react-hooks/set-state-in-effect，遵守 AGENTS.md）。
  useEffect(() => {
    if (permLoading || !allowed) return
    let alive = true
    void (async () => {
      try {
        // 全量候选人在前端按筛选 + 时间窗聚合（与现有报表一致）；
        // 推荐人 / 客户筛选下拉改用可搜索 SearchSelect，按需走轻量 options 接口（?q= 后端过滤），无需在此预拉。
        const candRes = await fetch('/api/candidates')
        if (!candRes.ok)
          throw new Error(
            (await candRes.clone().json().catch(() => ({}))).error || '',
          )
        const candJson = await candRes.json()
        if (!alive) return
        setCandidates(candJson.data ?? [])
      } catch (e) {
        if (alive) toast.error(e instanceof Error && e.message ? e.message : '加载失败')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [permLoading, allowed, toast])

  // ── 顶部筛选：作用于下方所有统计 / 明细 ──
  // 日期 input 是 yyyy-mm-dd；止日期用「次日 0 点」做半开区间上界（含当天）。
  const filtered = useMemo(() => {
    const recStart = filters.recommendStart ? new Date(filters.recommendStart) : null
    const recEnd = filters.recommendEnd
      ? new Date(new Date(filters.recommendEnd).getTime() + 86_400_000)
      : null
    // 计划日期：单选一日，按"当天"匹配（对应 offer到岗日期 offerOnboardDate）
    const planDay = filters.planDate ? new Date(filters.planDate) : null
    const planNext = planDay ? new Date(planDay.getTime() + 86_400_000) : null

    return candidates.filter((c) => {
      if (filters.status && c.recommendationStatus !== filters.status) return false
      if (filters.submitterId && String(c.submitterId) !== filters.submitterId) return false
      if (filters.customerId && String(c.customerId) !== filters.customerId) return false
      if (filters.channel && c.recruitmentChannel !== filters.channel) return false
      // 推荐日期窗口（对应 recommendationTime）
      if (recStart && !inRange(c.recommendationTime, recStart, new Date(8.64e15)))
        return false
      if (recEnd && !inRange(c.recommendationTime, new Date(0), recEnd)) return false
      // 计划日期（单日，对应 offer到岗日期 offerOnboardDate）
      if (planDay && planNext && !inRange(c.offerOnboardDate, planDay, planNext)) return false
      return true
    })
  }, [candidates, filters])

  // ── 指标计算（均在 filtered 基础上；"个人"= 当前登录用户作为推荐人 submitterId） ──
  const metrics = useMemo(() => {
    const now = new Date()
    const [tmStart, tmEnd] = thisMonthRange(now)
    const [lmStart, lmEnd] = lastMonthRange(now)
    const [rmStart, rmEnd] = recentMonthRange(now)
    const [yStart, yEnd] = thisYearRange(now)

    const isMine = (c: any) => userId != null && c.submitterId === userId

    // 1. 当月(个人)推荐简历数量
    const myThisMonthRecommended = filtered.filter(
      (c) => isMine(c) && inRange(c.recommendationTime, tmStart, tmEnd),
    ).length

    // 2. 最近1月(客户)推荐简历数量 —— 按客户分组、recommendationTime 在最近一个月
    const recentByCustomer = countBy(
      filtered.filter((c) => inRange(c.recommendationTime, rmStart, rmEnd)),
      (c) => c.customer?.shortName ?? '未分配客户',
    )

    // 3. 当月(个人)有效简历数量
    const myThisMonthValid = filtered.filter(
      (c) =>
        isMine(c) &&
        inRange(c.recommendationTime, tmStart, tmEnd) &&
        isValidResume(c.recommendationStatus),
    ).length

    // 4. 上月(个人)有效简历数量
    const myLastMonthValid = filtered.filter(
      (c) =>
        isMine(c) &&
        inRange(c.recommendationTime, lmStart, lmEnd) &&
        isValidResume(c.recommendationStatus),
    ).length

    // 5. 个人流程中人数情况 —— 当前用户推荐、状态处于进行中，按状态分组
    const myInProgress = filtered.filter(
      (c) => isMine(c) && IN_PROGRESS_SET.has(c.recommendationStatus),
    )
    const myInProgressDist = countBy(
      myInProgress,
      (c) => c.recommendationStatus,
      statusLabel,
    )

    // 6. 本年度候选人贡献度占比 —— 本年度各推荐人推荐数量占比
    const yearContribution = countBy(
      filtered.filter((c) => inRange(c.recommendationTime, yStart, yEnd)),
      (c) => c.submitter?.name ?? '未分配',
    )

    // 7. 当月人才推荐明细 —— 本月推荐的候选人明细
    const thisMonthDetail = filtered.filter((c) =>
      inRange(c.recommendationTime, tmStart, tmEnd),
    )

    return {
      myThisMonthRecommended,
      myThisMonthValid,
      myLastMonthValid,
      recentByCustomer,
      myInProgressDist,
      yearContribution,
      thisMonthDetail,
    }
  }, [filtered, userId])

  // 明细表列（仅展示需求列出的字段）
  // 明细表列：严格按需求列出的 5 个字段（推荐日期 / 推荐人 / 客户简称 / 岗位名称 / 推荐状态）
  const detailColumns: BoostColumn<any>[] = useMemo(
    () => [
      {
        key: 'recommendationTime',
        title: '推荐日期',
        accessor: (r) => r.recommendationTime,
        filterType: 'date',
        render: (v) => (v ? String(v).slice(0, 10) : '—'),
      },
      { key: 'submitterName', title: '推荐人', accessor: (r) => r.submitter?.name ?? '—' },
      { key: 'customerName', title: '客户简称', accessor: (r) => r.customer?.shortName ?? '—' },
      { key: 'positionName', title: '岗位名称', accessor: (r) => r.requirement?.positionName ?? '—' },
      {
        key: 'recommendationStatus',
        title: '推荐状态',
        accessor: (r) => statusLabel(r.recommendationStatus),
        filterType: 'select',
        filterOptions: RECOMMENDATION_STATUS_OPTIONS.map((o) => ({
          label: o.label,
          value: o.label,
        })),
        render: (v) => <span className="badge badge-info badge-sm">{v}</span>,
      },
    ],
    [],
  )

  // ── 守卫：放在所有 hooks 之后，避免破坏 Rules of Hooks ──
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">候选人推荐报表</h1>
          <p className="mt-0.5 text-sm text-base-content/50">个人 / 客户推荐与流程统计</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问数据报表</h2>
            <p className="max-w-md text-sm text-base-content/50">
              您当前没有查看数据报表的权限，请联系管理员开通
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="overflow-y-auto">
        <div className="flex h-64 items-center justify-center text-base-content/40">
          <span className="loading loading-spinner loading-md mr-3" />
          加载报表数据中…
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto pb-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-base-content">候选人推荐报表</h1>
        <p className="mt-1 text-sm text-base-content/50">
          个人 / 客户推荐数量、有效简历与流程中分布（筛选作用于下方全部统计与明细）
        </p>
      </div>

      {/* ── 顶部筛选区 ── */}
      <div className="mb-6 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-base-content">筛选条件</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">推荐状态</span>
            <SearchSelect
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={RECOMMENDATION_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              placeholder="全部"
              allowClear
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">推荐人</span>
            <SearchSelect
              value={filters.submitterId}
              onChange={(v) => setFilter('submitterId', v)}
              fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
              placeholder="全部"
              allowClear
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">客户名称</span>
            <SearchSelect
              value={filters.customerId}
              onChange={(v) => setFilter('customerId', v)}
              fetchOptions={searchFetch('/api/clients/options', (c) => ({ value: String(c.id), label: c.shortName ?? c.fullName }))}
              placeholder="全部"
              allowClear
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">简历渠道</span>
            <SearchSelect
              value={filters.channel}
              onChange={(v) => setFilter('channel', v)}
              options={channelOptions}
              placeholder="全部"
              allowClear
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">推荐日期(起)</span>
            <input
              type="date"
              className="input input-bordered input-sm w-full"
              value={filters.recommendStart}
              onChange={(e) => setFilter('recommendStart', e.target.value)}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">推荐日期(止)</span>
            <input
              type="date"
              className="input input-bordered input-sm w-full"
              value={filters.recommendEnd}
              onChange={(e) => setFilter('recommendEnd', e.target.value)}
            />
          </label>

          {/* 计划日期：单选一个日期（对应 offer到岗日期 offerOnboardDate） */}
          <label className="form-control w-full">
            <span className="label-text mb-1 text-xs text-base-content/60">
              计划日期{' '}
              <span className="text-base-content/30" title="对应 offer到岗日期(offerOnboardDate)">
                ⓘ
              </span>
            </span>
            <input
              type="date"
              className="input input-bordered input-sm w-full"
              value={filters.planDate}
              onChange={(e) => setFilter('planDate', e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-base-content/40">
            「计划日期」当前对应 offer到岗日期
          </p>
          <button className="btn btn-ghost btn-sm gap-1" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </button>
        </div>
      </div>

      {/* ── 图表区（数量类指标用柱状图，贡献度用饼图） ── */}
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
          推荐统计
        </h2>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="当月(个人)推荐简历数量" icon={BarChart3}>
          <ReactECharts
            option={barOption([{ name: '当月推荐', value: metrics.myThisMonthRecommended }], BRAND)}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard title="当月(个人)有效简历数量" icon={BarChart3}>
          <ReactECharts
            option={barOption([{ name: '当月有效', value: metrics.myThisMonthValid }], '#16A34A')}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard title="上月(个人)有效简历数量" icon={BarChart3}>
          <ReactECharts
            option={barOption([{ name: '上月有效', value: metrics.myLastMonthValid }], '#16A34A')}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard
          title="最近1月各客户推荐简历数量"
          icon={BarChart3}
          empty={metrics.recentByCustomer.length === 0}
        >
          <ReactECharts
            option={barOption(
              metrics.recentByCustomer,
              '#0EA5E9',
              metrics.recentByCustomer.length > 6 ? 30 : 0,
            )}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard
          title="个人流程中各状态人数"
          icon={BarChart3}
          empty={metrics.myInProgressDist.length === 0}
        >
          <ReactECharts
            option={barOption(metrics.myInProgressDist, '#D97706', 30)}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard
          title="本年度候选人贡献度占比（按推荐人）"
          icon={PieIcon}
          empty={metrics.yearContribution.length === 0}
        >
          <ReactECharts option={pieOption(metrics.yearContribution)} style={ECHART_STYLE} notMerge />
        </ChartCard>
      </div>

      {/* ── 当月人才推荐明细 ── */}
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
          当月人才推荐明细
        </h2>
      </div>
      <div className="rounded-xl border border-base-300 bg-base-100 p-2 shadow-sm">
        <BoostTable
          title={`当月推荐候选人（${metrics.thisMonthDetail.length}）`}
          columns={detailColumns}
          data={metrics.thisMonthDetail}
          loading={false}
          rowKey="id"
          searchPlaceholder="搜索候选人 / 客户 / 岗位 / 推荐人…"
        />
      </div>
    </div>
  )
}
