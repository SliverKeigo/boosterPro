'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, RotateCcw, ShieldAlert } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const EMPTY_FORM: any = { key: '', name: '', content: '', description: '' }
const clip = (s?: string) => (s ? (s.length > 40 ? s.slice(0, 40) + '…' : s) : '')

export default function AiPromptsPage() {
  const toast = useToast()
  const { isAdmin, loading: permLoading } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/ai-prompts')
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

  const openEdit = (r: any) => {
    setForm({ key: r.key, name: r.name ?? '', content: r.content ?? '', description: r.description ?? '' })
    setOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.content?.trim()) return toast.error('提示词内容不能为空')
    setSubmitting(true)
    try {
      const res = await fetch('/api/ai-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('已保存')
      setOpen(false)
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async (key: string) => {
    try {
      const res = await fetch(`/api/ai-prompts?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '')
      toast.success('已恢复默认')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '恢复失败')
    }
  }

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }
  if (!isAdmin) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">提示词管理</h1>
          <p className="mt-0.5 text-sm text-base-content/50">维护各 AI 功能的提示词</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">仅管理员可访问</p>
          </div>
        </div>
      </div>
    )
  }

  const columns: BoostColumn<any>[] = [
    { key: 'name', title: '名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'key', title: 'key', render: (v) => <span className="badge badge-ghost badge-sm font-mono">{v}</span> },
    { key: 'overridden', title: '状态', accessor: (r) => (r.overridden ? '已自定义' : '默认'),
      filterType: 'select', filterOptions: [{ label: '已自定义', value: '已自定义' }, { label: '默认', value: '默认' }],
      render: (v) => <span className={`badge badge-sm ${v === '已自定义' ? 'badge-info' : 'badge-ghost'}`}>{v}</span> },
    { key: 'description', title: '说明', sortable: false, render: (v) => <span className="text-base-content/60">{clip(v)}</span> },
    { key: 'content', title: '提示词预览', sortable: false, defaultVisible: false, render: (v) => <span className="line-clamp-1 max-w-[320px] text-base-content/60">{clip(v)}</span> },
    { key: 'updatedAt', title: '更新时间', filterType: 'date', render: (v) => (v ? String(v).slice(0, 10) : '—') },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">提示词管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">各 AI 功能的提示词从库读取（此处可改）；未自定义的用代码内置默认。模板用 {'{{变量}}'} 占位。</p>
      </div>

      <BoostTable
        title="AI 提示词"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="key"
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索名称 / key / 说明…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />编辑
            </button>
            {r.overridden && (
              <Popconfirm title="恢复为代码内置默认提示词？" onConfirm={() => handleReset(r.key)}>
                <button className="btn btn-ghost btn-xs gap-1 text-warning">
                  <RotateCcw className="h-3.5 w-3.5" />恢复默认
                </button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      <Modal
        open={open}
        title={`编辑提示词：${form.name || form.key}`}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText="保存"
        confirmLoading={submitting}
        width={720}
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="名称">
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="显示名" />
          </Field>
          <Field label="提示词内容" required>
            <textarea className="textarea textarea-bordered w-full font-mono text-xs" rows={12} value={form.content} onChange={(e) => setField('content', e.target.value)} placeholder="提示词模板，{{变量}} 占位" />
          </Field>
          <Field label="说明（可用变量）">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="如：可用变量 {{company}} {{demand}}" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
