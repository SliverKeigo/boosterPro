'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  SubTableCell,
  Modal,
  Popconfirm,
  Field,
  MultiFileUpload,
  RegionCascade,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'OPPORTUNITY'

// ─── 枚举映射 ──────────────────────────────────────────────────────────────────
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
  status: '线索阶段',
  nature: 'DIRECT',
  contactName: '',
  contactTitle: '',
  contactInfo: '',
  salesDecisionInfo: '',
  customerDecisionMaker: '',
  decisionMakerDescription: '',
  salesOwnerId: '',
  attachmentUrl: [],
  progressRecords: [],
}

export default function OpportunitiesPage() {
  const toast = useToast()
  const { can, canEditRow, userId } = useMyPermissions()
  const { items: statusOptions } = useDict('opportunity_status')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/opportunities')
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
    // 销售负责人默认填当前登录用户（仍可在下拉中改）
    setForm({ ...EMPTY_FORM, salesOwnerId: userId != null ? String(userId) : '' })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setForm({
      ...EMPTY_FORM,
      ...r,
      status: r.status ?? '',
      contactName: r.contactName ?? '',
      contactTitle: r.contactTitle ?? '',
      contactInfo: r.contactInfo ?? '',
      salesOwnerId: r.salesOwnerId ?? '',
      attachmentUrl: r.attachmentUrl ?? [],
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
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写商机名称')
    if (!form.description?.trim()) return toast.error('请填写商机描述')
    if (!form.region?.trim()) return toast.error('请选择所属区域')
    if (!form.status) return toast.error('请选择商机状态')
    if (!form.nature) return toast.error('请选择商机性质')
    if (!form.salesDecisionInfo?.trim()) return toast.error('请填写公司销售决策信息')
    if (!form.customerDecisionMaker?.trim()) return toast.error('请填写客户决策人')
    if (!form.decisionMakerDescription?.trim()) return toast.error('请填写决策人相关信息描述')
    if (!form.salesOwnerId) return toast.error('请选择销售负责人')
    setSubmitting(true)
    try {
      const url = editing ? `/api/opportunities/${editing.id}` : '/api/opportunities'
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
    { key: 'name', title: '商机名称', render: (v) => <span className="font-medium text-primary">{v}</span> },
    // 所属区域：表单用 RegionCascade 自由拼接的省市区字符串，非字典/枚举 → 文本筛选
    { key: 'region', title: '所属区域', filterType: 'text' },
    // 商机状态：表单用 useDict('opportunity_status') 下拉，列无 accessor 比较原始值（即字典 value）→ 用同一份字典项
    { key: 'status', title: '状态', filterType: 'select', filterOptions: statusOptions,
      render: (v) => v ? <span className="badge badge-ghost badge-sm">{v}</span> : <span className="text-base-content/30">—</span> },
    // 商机性质：列无 accessor 比较原始标识（DIRECT/INDIRECT），与表单 opts(NATURE_LABELS) 的 value 一致
    { key: 'nature', title: '商机性质', filterType: 'select', filterOptions: opts(NATURE_LABELS),
      render: (v) => <span className={`badge ${NATURE_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{NATURE_LABELS[v] ?? v}</span> },
    { key: 'contactName', title: '联系人', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'salesOwnerName', title: '销售负责人', accessor: (r) => r.salesOwner?.name,
      render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'createdAt', title: '创建时间', filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在"显示列"开启
    { key: 'description', title: '商机描述', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'contactTitle', title: '联系人职务', defaultVisible: false },
    { key: 'contactInfo', title: '联系人电话/EMAIL/微信', defaultVisible: false },
    { key: 'salesDecisionInfo', title: '公司销售决策信息', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'customerDecisionMaker', title: '客户决策人', defaultVisible: false },
    { key: 'decisionMakerDescription', title: '决策人信息描述', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'salesOwnerId', title: '销售负责人ID', defaultVisible: false },
    { key: 'progressRecords', title: '商机进展', defaultVisible: false, sortable: false,
      accessor: (r) => (r.progressRecords ?? []).map((p: any) => p.description).filter(Boolean).join('；'),
      render: (_v, r) => (
        <SubTableCell rows={r.progressRecords} title="商机进展" unit="条"
          columns={[
            { key: 'date', title: '日期', render: (v) => fmtDate(v) },
            { key: 'description', title: '进展描述' },
          ]} />
      ) },
    { key: 'attachmentUrl', title: '附件', defaultVisible: false, render: (v) => (v?.length ? `${v.length} 份` : '—') },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    { key: 'updatedByName', title: '修改人', accessor: (r) => r.updatedBy?.name ?? '—', filterType: 'text', defaultVisible: false },
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
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索名称 / 区域 / 联系人 / 负责人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
            {can(RES, 'DELETE') && canEditRow(RES, r) && (
              <Popconfirm title="确认删除该商机？" onConfirm={() => handleDelete(r.id)}>
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
        title={mode === 'view' ? '商机详情' : editing ? '编辑商机' : '新增商机'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={can(RES, 'EDIT') && canEditRow(RES, editing) ? () => setMode('edit') : undefined}
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
            <RegionCascade value={form.region} onChange={(v) => setField('region', v)} />
          </Field>
          <Field label="商机状态" required>
            <SearchSelect value={form.status} onChange={(v) => setField('status', v)} options={statusOptions} placeholder="请选择状态" />
          </Field>
          {/* 商机性质 / 商机联系人 */}
          <Field label="商机性质" required>
            <SearchSelect value={form.nature} onChange={(v) => setField('nature', v)} options={opts(NATURE_LABELS)} placeholder="请选择" />
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
          <Field label="销售负责人" required>
            <SearchSelect
              value={String(form.salesOwnerId ?? '')}
              onChange={(v) => setField('salesOwnerId', v)}
              fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
              initialLabel={editing?.salesOwner?.name ?? ''}
              placeholder="请选择"
            />
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
          <MultiFileUpload value={form.attachmentUrl} onChange={(urls) => setField('attachmentUrl', urls)} />
        </Field>
      </Modal>
    </div>
  )
}
