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
  useToast,
} from '@/components/ui'

// ─── 枚举映射 ──────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  LEAD: '线索阶段',
  PROSPECT: '商机阶段',
  PROPOSAL: '提案阶段',
  NEGOTIATE: '谈判阶段',
  CLOSED_WON: '成交',
  CLOSED: '关闭',
}
const STATUS_BADGE: Record<string, string> = {
  LEAD: 'badge-ghost',
  PROSPECT: 'badge-info',
  PROPOSAL: 'badge-primary',
  NEGOTIATE: 'badge-warning',
  CLOSED_WON: 'badge-success',
  CLOSED: 'badge-error',
}
const NATURE_LABELS: Record<string, string> = {
  DIRECT: '直接客户',
  INDIRECT: '间接客户',
}
const NATURE_BADGE: Record<string, string> = {
  DIRECT: 'badge-primary',
  INDIRECT: 'badge-ghost',
}

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }))
const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
const fmtDateTime = (s?: string | null) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : '—')

const EMPTY_FORM: any = {
  name: '',
  description: '',
  region: '',
  status: 'LEAD',
  nature: 'DIRECT',
  contactName: '',
  contactTitle: '',
  contactInfo: '',
  salesDecisionInfo: '',
  customerDecisionMaker: '',
  decisionMakerDescription: '',
  salesOwnerId: '',
  attachmentUrl: '',
  progressRecords: [],
}

export default function OpportunitiesPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/opportunities')
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
      contactName: r.contactName ?? '',
      contactTitle: r.contactTitle ?? '',
      contactInfo: r.contactInfo ?? '',
      salesOwnerId: r.salesOwnerId ?? '',
      progressRecords: (r.progressRecords ?? []).map((x: any) => ({
        date: fmtDate(x.date),
        description: x.description ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/opportunities/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('删除成功')
      void fetchData()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写商机名称')
    if (!form.description?.trim()) return toast.error('请填写商机描述')
    if (!form.region?.trim()) return toast.error('请填写所属区域')
    if (!form.salesDecisionInfo?.trim()) return toast.error('请填写公司销售决策信息')
    if (!form.customerDecisionMaker?.trim()) return toast.error('请填写客户决策人')
    if (!form.decisionMakerDescription?.trim()) return toast.error('请填写决策人信息描述')
    setSubmitting(true)
    try {
      const url = editing ? `/api/opportunities/${editing.id}` : '/api/opportunities'
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
    { key: 'name', title: '商机名称', render: (v) => <span className="font-medium text-primary">{v}</span> },
    { key: 'region', title: '所属区域' },
    { key: 'status', title: '状态',
      render: (v) => <span className={`badge ${STATUS_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{STATUS_LABELS[v] ?? v}</span> },
    { key: 'nature', title: '商机性质',
      render: (v) => <span className={`badge ${NATURE_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{NATURE_LABELS[v] ?? v}</span> },
    { key: 'contactName', title: '联系人', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'salesOwnerName', title: '销售负责人', accessor: (r) => r.salesOwner?.name,
      render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'createdAt', title: '创建时间', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在"显示列"开启
    { key: 'description', title: '商机描述', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'contactTitle', title: '联系人职务', defaultVisible: false },
    { key: 'contactInfo', title: '联系人电话/EMAIL/微信', defaultVisible: false },
    { key: 'salesDecisionInfo', title: '公司销售决策信息', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'customerDecisionMaker', title: '客户决策人', defaultVisible: false },
    { key: 'decisionMakerDescription', title: '决策人信息描述', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'salesOwnerId', title: '销售负责人ID', defaultVisible: false },
    { key: 'progressRecords', title: '商机进展数', defaultVisible: false, sortable: false,
      accessor: (r) => (r.progressRecords?.length ?? 0),
      render: (_v, r) => <span className="badge badge-ghost badge-sm">{r.progressRecords?.length ?? 0}</span> },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">商机管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理所有商机信息及跟进进展</p>
      </div>

      <BoostTable
        title="商机列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={fetchData}
        searchPlaceholder="搜索名称 / 区域 / 联系人 / 负责人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该商机？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑商机' : '新增商机'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={760}
      >
        <div className="grid grid-cols-2 gap-4">
          {/* 商机名称 / 商机描述 */}
          <Field label="商机名称" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="商机描述" required>
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 所属区域 / 商机状态 */}
          <Field label="所属区域" required>
            <input className="input input-bordered w-full" value={form.region} onChange={(e) => setField('region', e.target.value)} placeholder="请选择" />
          </Field>
          <Field label="商机状态" required>
            <select className="select select-bordered w-full" value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {opts(STATUS_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {/* 商机性质 / 商机联系人 */}
          <Field label="商机性质" required>
            <select className="select select-bordered w-full" value={form.nature} onChange={(e) => setField('nature', e.target.value)}>
              {opts(NATURE_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="商机联系人">
            <input className="input input-bordered w-full" value={form.contactName} onChange={(e) => setField('contactName', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 商机联系人职务 / 商机联系人电话/EMAIL/微信 */}
          <Field label="商机联系人职务">
            <input className="input input-bordered w-full" value={form.contactTitle} onChange={(e) => setField('contactTitle', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="商机联系人电话/EMAIL/微信">
            <input className="input input-bordered w-full" value={form.contactInfo} onChange={(e) => setField('contactInfo', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 公司销售决策信息 / 客户决策人 */}
          <Field label="公司销售决策信息" required>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.salesDecisionInfo} onChange={(e) => setField('salesDecisionInfo', e.target.value)} placeholder="确定本线索为公司有效销售商机的决策" />
          </Field>
          <Field label="客户决策人" required>
            <input className="input input-bordered w-full" value={form.customerDecisionMaker} onChange={(e) => setField('customerDecisionMaker', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 决策人相关信息描述 / 销售负责人 */}
          <Field label="决策人相关信息描述" required>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.decisionMakerDescription} onChange={(e) => setField('decisionMakerDescription', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="销售负责人 ID" required>
            <input type="number" className="input input-bordered w-full" value={form.salesOwnerId} onChange={(e) => setField('salesOwnerId', e.target.value)} placeholder="请选择（用户 ID）" />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 子表：商机进展 */}
        <SubTable
          title="商机进展"
          value={form.progressRecords}
          onChange={(rows) => setField('progressRecords', rows)}
          columns={[
            { key: 'date', title: '日期', type: 'date', width: 160 },
            { key: 'description', title: '进展描述', type: 'textarea', width: 360 },
          ]}
        />

        <div className="divider my-3" />

        {/* 附件1 */}
        <Field label="附件1">
          <FileUpload value={form.attachmentUrl} onChange={(url) => setField('attachmentUrl', url)} />
        </Field>
      </Modal>
    </div>
  )
}
