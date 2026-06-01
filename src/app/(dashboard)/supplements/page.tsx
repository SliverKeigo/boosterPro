'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  Modal,
  Popconfirm,
  Field,
  FileUpload,
  RichText,
  useToast,
} from '@/components/ui'

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
  const [data, setData] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((j) => setCustomers(j.data || []))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/supplements')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json.data)
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openEdit = (r: any) => {
    setEditing(r)
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
      if (!res.ok) throw new Error()
      toast.success('删除成功')
      void fetchData()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId || String(form.customerId).trim() === '') return toast.error('请填写关联客户 ID')
    setSubmitting(true)
    try {
      const url = editing ? `/api/supplements/${editing.id}` : '/api/supplements'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchData()
    } catch {
      toast.error(editing ? '更新失败' : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: BoostColumn<any>[] = [
    { key: 'customerName', title: '客户简称', accessor: (r) => r.customer?.shortName,
      render: (v) => v ? <span className="font-medium text-primary">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'demandCustomer', title: '需求客户', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'openingSpeech', title: '开聊话术', sortable: false, render: (v) => clip(v) },
    { key: 'companyCultureWelfare', title: '企业文化福利等说明', sortable: false, render: (v) => stripHtml(v) },
    { key: 'createdAt', title: '创建时间', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'customerId', title: '客户 ID', defaultVisible: false },
    { key: 'notes', title: '备注', defaultVisible: false },
    { key: 'attachmentUrl', title: '附件', defaultVisible: false, sortable: false, render: (v) => v ? '已上传' : '—' },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, render: (v) => fmtDateTime(v) },
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
        onCreate={openCreate}
        createText="新增"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={fetchData}
        searchPlaceholder="搜索客户 / 需求客户 / 话术…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该补充信息？" onConfirm={() => handleDelete(r.id)}>
              <button className="btn btn-ghost btn-xs gap-1 text-error">
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </Popconfirm>
          </div>
        )}
      />

      {/* ── 新建 / 编辑 ── */}
      <Modal
        open={open}
        title={editing ? '编辑补充信息' : '新增补充信息'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="关联客户" required>
            <select className="select select-bordered w-full" value={form.customerId} onChange={(e) => setField('customerId', e.target.value)}>
              <option value="">请选择客户</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
            </select>
          </Field>
          <Field label="需求客户">
            <input className="input input-bordered w-full" value={form.demandCustomer} onChange={(e) => setField('demandCustomer', e.target.value)} placeholder="请输入" />
          </Field>
        </div>

        <div className="divider my-3" />

        <div className="grid grid-cols-1 gap-4">
          <Field label="开聊话术">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.openingSpeech} onChange={(e) => setField('openingSpeech', e.target.value)} placeholder="与候选人开聊时使用的话术" />
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
