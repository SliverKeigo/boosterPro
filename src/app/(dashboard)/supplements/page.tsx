'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Trash2, Sparkles } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  SubTableCell,
  Modal,
  Popconfirm,
  Field,
  FileUpload,
  RichText,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const RES = 'CLIENT_SUPPLEMENT'

const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
const fmtDateTime = (s?: string | null) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : '—')
const clip = (v?: string | null) => (v ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : '—')
const stripHtml = (v?: string | null) => (v ? v.replace(/<[^>]+>/g, '').slice(0, 40) : '—')

const EMPTY_FORM: any = {
  customerId: '', demandCustomer: '', openingSpeech: '',
  companyCultureWelfare: '', notes: '', attachmentUrl: '',
  demandUpdates: [], customerProfiles: [],
}

export default function SupplementsPage() {
  const toast = useToast()
  const router = useRouter()
  const { can, canEditRow } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const [aiLoading, setAiLoading] = useState(false)

  // AI 生成开聊话术（联网了解该客户后，生成向候选人介绍/推荐的话术），填入「开聊话术」
  const genOpening = async () => {
    if (!form.customerId) return toast.error('请先选择客户名称')
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/supplement-opening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: form.customerId, demand: form.demandCustomer }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || 'AI 生成失败'); return }
      setField('openingSpeech', json.opening)
      toast.success('已生成开聊话术')
    } catch {
      toast.error('AI 请求失败')
    } finally {
      setAiLoading(false)
    }
  }

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/supplements')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      const json = await res.json()
      setData(json.data)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('加载失败'))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    // 包一层异步 IIFE（首句即 await），让 effect 同步路径不含 setState（react-hooks/set-state-in-effect）
    void (async () => {
      await fetchData()
    })()
  }, [fetchData])

  const openCreate = () => {
    setEditing(null)
    setMode('edit')
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setForm({
      ...EMPTY_FORM,
      ...r,
      customerId: r.customerId ?? '',
      demandUpdates: (r.demandUpdates ?? []).map((x: any) => ({
        date: fmtDate(x.date),
        content: x.content ?? '',
      })),
      customerProfiles: (r.customerProfiles ?? []).map((x: any) => ({
        specialty: x.specialty ?? '',
        description: x.description ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/supplements/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId || String(form.customerId).trim() === '') return toast.error('请选择客户名称')
    setSubmitting(true)
    try {
      const url = editing ? `/api/supplements/${editing.id}` : '/api/supplements'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : (editing ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns: BoostColumn<any>[] = [
    { key: 'createdByName', title: '提交人', accessor: (r) => r.createdBy?.name ?? '—', filterType: 'text' },
    { key: 'createdByDept', title: '部门', accessor: (r) => r.createdBy?.department?.name ?? '—', filterType: 'text' },
    { key: 'customerName', title: '客户简称', accessor: (r) => r.customer?.shortName,
      render: (v, r) => v ? <span className="font-medium text-primary cursor-pointer hover:underline" onClick={() => r.customer?.id && router.push(`/clients?view=${r.customer.id}`)}>{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'demandCustomer', title: '需求客户', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'openingSpeech', title: '开聊话术', sortable: false, render: (v) => clip(v) },
    { key: 'companyCultureWelfare', title: '企业文化福利等说明', sortable: false, render: (v) => stripHtml(v) },
    { key: 'createdAt', title: '创建时间', filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'customerId', title: '客户 ID', defaultVisible: false, filterType: 'number' },
    { key: 'notes', title: '备注', defaultVisible: false },
    { key: 'attachmentUrl', title: '附件', defaultVisible: false, sortable: false, render: (v) => v ? '已上传' : '—' },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => fmtDateTime(v) },
    { key: 'demandUpdates', title: '需求更新', defaultVisible: false, sortable: false,
      accessor: (r) => (r.demandUpdates ?? []).map((x: any) => x.content).filter(Boolean).join(' '),
      render: (_v, r) => (
        <SubTableCell
          rows={r.demandUpdates}
          title="需求更新"
          unit="条"
          columns={[
            { key: 'date', title: '日期', render: (v) => fmtDate(v) },
            { key: 'content', title: '更新内容' },
          ]}
        />
      ) },
    { key: 'customerProfiles', title: '客户画像', defaultVisible: false, sortable: false,
      accessor: (r) =>
        (r.customerProfiles ?? [])
          .map((x: any) => [x.specialty, x.description].filter(Boolean).join(' '))
          .filter(Boolean)
          .join(' '),
      render: (_v, r) => (
        <SubTableCell
          rows={r.customerProfiles}
          title="客户画像"
          unit="条"
          columns={[
            { key: 'specialty', title: '专长' },
            { key: 'description', title: '描述' },
          ]}
        />
      ) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">客户补充信息</h1>
        <p className="mt-0.5 text-sm text-base-content/50">维护客户开聊话术、文化福利、需求更新与客户画像</p>
      </div>

      <BoostTable
        title="补充信息列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索客户 / 需求客户 / 话术…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
            {can(RES, 'DELETE') && canEditRow(RES, r) && (
              <Popconfirm title="确认删除该补充信息？" onConfirm={() => handleDelete(r.id)}>
                <button className="btn btn-ghost btn-xs gap-1 text-error">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      {/* ── 新建 / 编辑 ── */}
      <Modal
        open={open}
        title={mode === 'view' ? '补充信息详情' : editing ? '编辑补充信息' : '新增补充信息'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={can(RES, 'EDIT') && canEditRow(RES, editing) ? () => setMode('edit') : undefined}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="客户名称" required>
            <SearchSelect
              value={String(form.customerId ?? '')}
              onChange={(v) => setField('customerId', v)}
              fetchOptions={searchFetch('/api/clients/options', (c) => ({ value: String(c.id), label: c.shortName || c.fullName }))}
              initialLabel={editing?.customer?.shortName ?? ''}
              placeholder="请选择客户"
            />
          </Field>
          <Field label="需求客户">
            <input className="input input-bordered w-full" value={form.demandCustomer} onChange={(e) => setField('demandCustomer', e.target.value)} placeholder="请输入" />
          </Field>
        </div>

        <div className="divider my-3" />

        <div className="grid grid-cols-1 gap-4">
          <Field label="开聊话术">
            <div className="mb-1.5">
              <button type="button" className="btn btn-outline btn-xs gap-1 text-primary" disabled={aiLoading} onClick={genOpening}>
                {aiLoading ? <span className="loading loading-spinner loading-xs" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI 生成开聊话术
              </button>
              <span className="ml-2 text-xs text-base-content/40">据所选客户联网生成（约 10~20s）</span>
            </div>
            <textarea className="textarea textarea-bordered w-full" rows={4} value={form.openingSpeech} onChange={(e) => setField('openingSpeech', e.target.value)} placeholder="与候选人开聊时使用的话术（可点上方 AI 生成）" />
          </Field>
          <Field label="企业文化福利等说明">
            <RichText value={form.companyCultureWelfare} onChange={(html) => setField('companyCultureWelfare', html)} placeholder="企业文化、福利待遇等" />
          </Field>
          <Field label="备注">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="其他备注信息" />
          </Field>
          <Field label="附件">
            <FileUpload value={form.attachmentUrl} onChange={(url) => setField('attachmentUrl', url)} />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 子表 */}
        <div className="space-y-4">
          <SubTable
            title="需求更新"
            value={form.demandUpdates}
            onChange={(rows) => setField('demandUpdates', rows)}
            columns={[
              { key: 'date', title: '日期', type: 'date', width: 160 },
              { key: 'content', title: '更新内容', type: 'textarea', width: 360 },
            ]}
          />
          <SubTable
            title="客户画像"
            value={form.customerProfiles}
            onChange={(rows) => setField('customerProfiles', rows)}
            columns={[
              { key: 'specialty', title: '特长', type: 'text', width: 200 },
              { key: 'description', title: '描述', type: 'textarea', width: 360 },
            ]}
          />
        </div>
      </Modal>
    </div>
  )
}
