'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { BarChart3, PieChart, Users, FileText } from 'lucide-react'

// ─── 枚举映射（与 candidates / requirements 页保持一致） ──────────────────────────
const STATUS_LABELS: Record<string, string> = {
  PENDING: '已推荐待反馈',
  INTERVIEWING: '面试中',
  SALARY_NEGO: '谈薪中',
  OFFERING: 'Offer中',
  ONBOARDING: '入职中',
  GUARANTEE: '保证期',
  POST_GUARANTEE_CLOSED: '过保关闭',
  RESUME_FAILED: '简历失败',
  INTERNAL_RESUME_FAILED: '简历内推失败',
  INTERVIEW_SCHEDULE_FAILED: '约面失败',
  INTERVIEW_FAILED: '面试失败',
  SALARY_NEGO_FAILED: '谈薪失败',
  OFFER_FAILED: 'Offer失败',
  ONBOARD_FAILED: '入职失败',
  NOT_PASSED_GUARANTEE: '未过保',
  RESIGNED_POST_GUARANTEE: '离职统计已过保',
  RESIGNED_LOCAL: '离职统计本地',
}

// 流程中（在途）状态——区别于失败/关闭/离职等终态
const IN_PROGRESS_STATUSES = [
  'PENDING',
  'INTERVIEWING',
  'SALARY_NEGO',
  'OFFERING',
  'ONBOARDING',
  'GUARANTEE',
]

const statusLabel = (s: string) => STATUS_LABELS[s] ?? s

// ─── 品牌配色（主色 #0369A1 + 衍生蓝 / 绿 / 橙） ───────────────────────────────────
const BRAND = '#0369A1'
const PALETTE = [
  '#0369A1', // 主色 深蓝
  '#0EA5E9', // 天蓝
  '#16A34A', // 绿
  '#D97706', // 橙
  '#2563EB', // 蓝
  '#0D9488', // 青绿
  '#7C3AED', // 紫
  '#DC2626', // 红
  '#65A30D', // 黄绿
  '#0891B2', // 蓝绿
  '#EA580C', // 深橙
  '#4F46E5', // 靛
]

// ─── 聚合工具 ────────────────────────────────────────────────────────────────────
/** 按 keyOf 取分组计数，返回按数量降序的 { name, value }[]；可选 labelOf 做键→展示名映射 */
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

// ─── 通用 option 构造 ────────────────────────────────────────────────────────────
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
      axisLabel: {
        color: '#475569',
        interval: 0,
        rotate,
        hideOverlap: true,
      },
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
        label: {
          show: true,
          position: 'top',
          color: '#334155',
          fontSize: 11,
        },
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

/** 流程中各状态人数：分组堆叠柱状图（横轴=状态，分系列=客户） */
function stackedByStatusOption(
  candidates: any[],
): { option: any; empty: boolean } {
  const inProgress = candidates.filter((c) =>
    IN_PROGRESS_STATUSES.includes(c.recommendationStatus),
  )
  if (inProgress.length === 0) return { option: {}, empty: true }

  // 横轴：实际出现的在途状态（保持枚举顺序）
  const statuses = IN_PROGRESS_STATUSES.filter((s) =>
    inProgress.some((c) => c.recommendationStatus === s),
  )
  // 系列：客户（最多取前 8 个客户，其余归「其他」，避免图例爆炸）
  const custCount = new Map<string, number>()
  for (const c of inProgress) {
    const name = c.customer?.shortName ?? '未分配客户'
    custCount.set(name, (custCount.get(name) ?? 0) + 1)
  }
  const topCustomers = [...custCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name)
  const custKey = (c: any) => {
    const name = c.customer?.shortName ?? '未分配客户'
    return topCustomers.includes(name) ? name : '其他'
  }
  const seriesNames = [...topCustomers]
  if (inProgress.some((c) => custKey(c) === '其他')) seriesNames.push('其他')

  const series = seriesNames.map((sName, i) => ({
    name: sName,
    type: 'bar',
    stack: 'total',
    itemStyle: { color: PALETTE[i % PALETTE.length] },
    emphasis: { focus: 'series' },
    data: statuses.map(
      (st) =>
        inProgress.filter(
          (c) => c.recommendationStatus === st && custKey(c) === sName,
        ).length,
    ),
  }))

  return {
    empty: false,
    option: {
      textStyle: baseTextStyle,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: '#475569', fontSize: 12 },
      },
      grid: { left: 8, right: 16, top: 40, bottom: 60, containLabel: true },
      xAxis: {
        type: 'category',
        data: statuses.map(statusLabel),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', interval: 0, rotate: 30, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series,
    },
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────────
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

export default function ReportsPage() {
  // loading 初始为 true，仅在客户端首个 effect 拉数完成后才渲染图表，
  // 既避免 SSR 阶段 echarts 访问 window，也保证服务端 / 客户端首屏一致
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<any[]>([])
  const [requirements, setRequirements] = useState<any[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/candidates').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/requirements').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([c, r]) => {
        if (!alive) return
        setCandidates(c.data ?? [])
        setRequirements(r.data ?? [])
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // ── 候选人维度聚合 ──
  const statusDist = useMemo(
    () => countBy(candidates, (c) => c.recommendationStatus, statusLabel),
    [candidates],
  )
  const bySubmitter = useMemo(
    () => countBy(candidates, (c) => c.submitter?.name ?? '未分配'),
    [candidates],
  )
  const stacked = useMemo(() => stackedByStatusOption(candidates), [candidates])

  // ── 需求维度聚合 ──
  const byCustomer = useMemo(
    () => countBy(requirements, (r) => r.customer?.shortName ?? '未分配客户'),
    [requirements],
  )
  const reqStatusDist = useMemo(
    () => countBy(requirements, (r) => r.status),
    [requirements],
  )

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
    <div className="overflow-y-auto pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-base-content">数据报表</h1>
        <p className="mt-1 text-sm text-base-content/50">
          候选人推荐与客户需求的统计概览（共 {candidates.length} 份简历 · {requirements.length} 条需求）
        </p>
      </div>

      {/* ── 候选人维度 ── */}
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
          候选人维度
        </h2>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="推荐状态分布" icon={BarChart3} empty={statusDist.length === 0}>
          <ReactECharts
            option={barOption(statusDist, BRAND, 30)}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard title="按提交人统计推荐数" icon={BarChart3} empty={bySubmitter.length === 0}>
          <ReactECharts
            option={barOption(bySubmitter, '#16A34A', bySubmitter.length > 6 ? 30 : 0)}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard title="推荐状态占比" icon={PieChart} empty={statusDist.length === 0}>
          <ReactECharts option={pieOption(statusDist)} style={ECHART_STYLE} notMerge />
        </ChartCard>

        <ChartCard title="流程中各状态人数（按客户堆叠）" icon={BarChart3} empty={stacked.empty}>
          <ReactECharts option={stacked.option} style={ECHART_STYLE} notMerge />
        </ChartCard>
      </div>

      {/* ── 需求维度 ── */}
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
          需求维度
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="分客户需求数量" icon={BarChart3} empty={byCustomer.length === 0}>
          <ReactECharts
            option={barOption(byCustomer, '#0EA5E9', byCustomer.length > 6 ? 30 : 0)}
            style={ECHART_STYLE}
            notMerge
          />
        </ChartCard>

        <ChartCard title="岗位状态分布" icon={PieChart} empty={reqStatusDist.length === 0}>
          <ReactECharts option={pieOption(reqStatusDist)} style={ECHART_STYLE} notMerge />
        </ChartCard>
      </div>
    </div>
  )
}
