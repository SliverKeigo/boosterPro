'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { BoostTable, type BoostColumn, useToast, EllipsisTooltip } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const RES = 'SYS_USER' // 移交日志归用户管理查看权限

const fmtDateTime = (s?: string | null) => (s ? `${String(s).slice(0, 10)} ${String(s).slice(11, 16)}` : '—')

// 各业务表移交条数明细（moved JSON）→ 中文摘要，仅列出有移交的表
const MOVED_LABELS: Record<string, string> = {
  candidate: '候选人', requirement: '客户需求', clientSupplement: '客户补充', customerContact: '客户联系人',
  talentPool: '人才库', opportunity: '商机', customer: '客户', contract: '合同', knowledgeBase: '知识库',
}
const movedSummary = (moved: any): string => {
  if (!moved || typeof moved !== 'object') return '—'
  const parts = Object.entries(moved)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${MOVED_LABELS[k] ?? k} ${v}`)
  return parts.length ? parts.join('、') : '无数据'
}

export default function TransferLogsPage() {
  const toast = useToast()
  const { can, loading: permLoading } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/transfer-logs')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      setData((await res.json()).data ?? [])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void (async () => { await fetchData() })()
  }, [fetchData])

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }
  if (!can(RES, 'VIEW')) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">移交日志</h1>
          <p className="mt-0.5 text-sm text-base-content/50">查看权限移交记录</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">无权限访问，请联系管理员开通</p>
          </div>
        </div>
      </div>
    )
  }

  const columns: BoostColumn<any>[] = [
    { key: 'createdAt', title: '移交时间', filterType: 'date', render: (v) => <span className="text-base-content/70">{fmtDateTime(v)}</span> },
    { key: 'fromUserName', title: '被移交用户', filterType: 'text', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'toUserName', title: '移交给', filterType: 'text', render: (v) => <span className="font-medium text-primary">{v}</span> },
    { key: 'operatorName', title: '操作人', filterType: 'text' },
    { key: 'totalCount', title: '移交条数', filterType: 'number', render: (v) => <span className="badge badge-ghost badge-sm">{v}</span> },
    { key: 'moved', title: '明细', sortable: false, render: (v) => <EllipsisTooltip className="line-clamp-1 max-w-[360px] text-base-content/60" content={movedSummary(v)} /> },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">移交日志</h1>
        <p className="mt-0.5 text-sm text-base-content/50">每次「用户权限移交」的记录：谁的数据移交给了谁、操作人、移交了多少条（只读、不可改删）</p>
      </div>
      <BoostTable
        title="移交记录"
        storageKey="transfer-logs"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索被移交用户 / 移交给 / 操作人…"
      />
    </div>
  )
}
