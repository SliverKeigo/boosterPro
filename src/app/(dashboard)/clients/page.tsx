'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2, Sparkles } from 'lucide-react'
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
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'CUSTOMER'

const fmtDateTime = (s?: string | null) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : '—')
const stripHtml = (v?: string | null) => (v ? v.replace(/<[^>]+>/g, '').slice(0, 40) : '—')

const EMPTY_FORM: any = {
  fullName: '',
  shortName: '',
  formerName: '',
  industry: '',
  region: '',
  detailedAddress: '',
  companyCulture: '',
  openingSpeech: '',
  benchmarkCompanies: '',
  attachmentUrl: '',
  officeAddresses: [],
}

export default function ClientsPage() {
  const toast = useToast()
  const { can, isOwner } = useMyPermissions()
  const { items: industryOptions } = useDict('industry')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleGenerateCompanyInfo = async () => {
    const companyName = form.fullName || form.shortName
    if (!companyName || !String(companyName).trim()) return toast.error('请先填写客户名称')
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/company-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI 生成失败')
      const fields = ['industry', 'region', 'formerName', 'companyCulture', 'benchmarkCompanies', 'detailedAddress']
      let filled = 0
      for (const f of fields) {
        if (data[f]) {
          setField(f, data[f])
          filled++
        }
      }
      toast.success(filled ? `已根据联网信息自动填充 ${filled} 个字段` : 'AI 未返回可填充内容')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 生成失败')
    } finally {
      setAiLoading(false)
    }
  }

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/clients')
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
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openEdit = (r: any) => {
    setEditing(r)
    setForm({
      ...EMPTY_FORM,
      ...r,
      fullName: r.fullName ?? '',
      formerName: r.formerName ?? '',
      industry: r.industry ?? '',
      companyCulture: r.companyCulture ?? '',
      openingSpeech: r.openingSpeech ?? '',
      benchmarkCompanies: r.benchmarkCompanies ?? '',
      officeAddresses: (r.officeAddresses ?? []).map((x: any) => ({
        address: x.address ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.fullName?.trim()) return toast.error('请填写客户名称')
    if (!form.shortName?.trim()) return toast.error('请填写客户简称')
    if (!form.region?.trim()) return toast.error('请填写所属区域')
    if (!form.detailedAddress?.trim()) return toast.error('请填写详细地址')
    setSubmitting(true)
    try {
      const url = editing ? `/api/clients/${editing.id}` : '/api/clients'
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
    { key: 'fullName', title: '客户名称', render: (v) => v ? <span className="font-medium">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'shortName', title: '客户简称', render: (v) => <span className="font-medium text-primary">{v}</span> },
    { key: 'industry', title: '所属行业', filterType: 'select', filterOptions: industryOptions, render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'region', title: '所属区域' },
    { key: 'officeAddresses', title: '办公地址', sortable: false,
      accessor: (r) => (r.officeAddresses ?? []).map((x: any) => x.address).filter(Boolean).join('；'),
      render: (_v, r) => (
        <SubTableCell rows={r.officeAddresses} title="办公地址"
          columns={[{ key: 'address', title: '办公地址' }]} />
      ) },
    { key: 'createdAt', title: '创建时间', filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在"显示列"开启
    { key: 'formerName', title: '客户曾用名', defaultVisible: false },
    { key: 'detailedAddress', title: '详细地址', defaultVisible: false },
    { key: 'companyCulture', title: '企业文化与福利', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{stripHtml(v)}</span> : '—' },
    { key: 'openingSpeech', title: '开聊话术', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'benchmarkCompanies', title: '对标企业', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[240px]">{v}</span> : '—' },
    { key: 'locationLat', title: '纬度', defaultVisible: false, filterType: 'number', render: (v) => (v ?? '') === '' ? '—' : String(v) },
    { key: 'locationLng', title: '经度', defaultVisible: false, filterType: 'number', render: (v) => (v ?? '') === '' ? '—' : String(v) },
    { key: 'attachmentUrl', title: '客户附件资料', defaultVisible: false, sortable: false, render: (v) => v ? '已上传' : '—' },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">客户基本信息</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理所有客户的基础资料与办公地址</p>
      </div>

      <BoostTable
        title="客户列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索简称 / 行业 / 区域 / 地址…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该客户？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑客户' : '新增客户'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={760}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="客户名称" required>
            <div className="flex items-center gap-2">
              <input className="input input-bordered w-full" value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} placeholder="请输入" />
              <button
                type="button"
                className="btn btn-primary btn-sm shrink-0 gap-1"
                disabled={aiLoading}
                onClick={handleGenerateCompanyInfo}
              >
                {aiLoading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    AI 智能填充
                  </>
                )}
              </button>
            </div>
          </Field>
          <Field label="客户简称" required>
            <input className="input input-bordered w-full" value={form.shortName} onChange={(e) => setField('shortName', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="客户曾用名">
            <input className="input input-bordered w-full" value={form.formerName} onChange={(e) => setField('formerName', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="所属行业">
            <SearchSelect value={form.industry} onChange={(v) => setField('industry', v)} options={industryOptions} placeholder="请选择" />
          </Field>
          <Field label="所属区域" required>
            <input className="input input-bordered w-full" value={form.region} onChange={(e) => setField('region', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="详细地址" required>
            <input className="input input-bordered w-full" value={form.detailedAddress} onChange={(e) => setField('detailedAddress', e.target.value)} placeholder="请输入" />
          </Field>
        </div>

        <div className="divider my-3" />

        <div className="grid grid-cols-1 gap-4">
          <Field label="企业文化与福利">
            <RichText value={form.companyCulture} onChange={(html) => setField('companyCulture', html)} placeholder="请输入" />
          </Field>
          <Field label="开聊话术">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.openingSpeech} onChange={(e) => setField('openingSpeech', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="对标企业">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.benchmarkCompanies} onChange={(e) => setField('benchmarkCompanies', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="客户附件资料">
            <FileUpload value={form.attachmentUrl} onChange={(url) => setField('attachmentUrl', url)} />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 子表：多办公地址 */}
        <SubTable
          title="办公地址"
          value={form.officeAddresses}
          onChange={(rows) => setField('officeAddresses', rows)}
          columns={[
            { key: 'address', title: '办公地址', type: 'text', width: 480 },
          ]}
        />
      </Modal>
    </div>
  )
}
