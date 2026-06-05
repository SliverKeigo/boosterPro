'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  SubTableCell,
  Modal,
  Popconfirm,
  Field,
  FileUpload,
  YearSelect,
  yearOptions,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'CONTRACT'

const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')

const EMPTY_FORM: any = {
  customerId: '',
  contractName: '',
  signingYear: '',
  effectiveStart: '',
  effectiveEnd: '',
  expiryDate: '',
  serviceType: '',
  headhunterFeeRate: '',
  billingMonths: '',
  ropFeeRate: '',
  salesOwnerId: '',
  deliveryOwnerId: '',
  contractFileUrl: '',
  invoiceInfoText: '',
  invoiceInfoFileUrl: '',
  notes: '',
  invoices: [],
}

export default function ContractsPage() {
  const toast = useToast()
  const { can, isOwner, userId } = useMyPermissions()
  const { items: serviceTypeOptions } = useDict('service_type')
  const { items: invoiceTypeOptions } = useDict('invoice_type')
  const { items: verificationResultOptions } = useDict('verification_result')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/contracts')
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
    // 销售负责人默认填当前登录用户（仍可在下拉中改）
    setForm({ ...EMPTY_FORM, salesOwnerId: userId != null ? String(userId) : '' })
    setOpen(true)
  }

  const openEdit = (r: any) => {
    setEditing(r)
    setForm({
      ...EMPTY_FORM,
      ...r,
      customerId: r.customerId ?? '',
      signingYear: r.signingYear ?? '',
      headhunterFeeRate: r.headhunterFeeRate ?? '',
      billingMonths: r.billingMonths ?? '',
      ropFeeRate: r.ropFeeRate ?? '',
      salesOwnerId: r.salesOwnerId ?? '',
      deliveryOwnerId: r.deliveryOwnerId ?? '',
      effectiveStart: fmtDate(r.effectiveStart),
      effectiveEnd: fmtDate(r.effectiveEnd),
      expiryDate: fmtDate(r.expiryDate),
      invoices: (r.invoices ?? []).map((x: any) => ({
        invoiceType: x.invoiceType ?? '',
        verificationResult: x.verificationResult ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId?.toString().trim()) return toast.error('请选择客户名称')
    if (!form.contractName?.trim()) return toast.error('请填写合同名称')
    if (!form.signingYear?.toString().trim()) return toast.error('请选择签订年份')
    if (!form.effectiveStart) return toast.error('请选择合同生效起始日期')
    if (!form.effectiveEnd) return toast.error('请选择合同结束日期')
    if (!form.expiryDate) return toast.error('请选择合同到期日期')
    if (!form.serviceType?.trim()) return toast.error('请选择服务类型')
    if (!form.contractFileUrl?.trim()) return toast.error('请上传合同附件')
    setSubmitting(true)
    try {
      const url = editing ? `/api/contracts/${editing.id}` : '/api/contracts'
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
    {
      key: 'customerName',
      title: '关联客户',
      accessor: (r) => r.customer?.shortName,
      render: (v) =>
        v ? (
          <span className="font-medium text-primary">{v}</span>
        ) : (
          <span className="text-base-content/30">—</span>
        ),
    },
    { key: 'contractName', title: '合同名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'serviceType', title: '服务类型', filterType: 'select', filterOptions: serviceTypeOptions },
    { key: 'signingYear', title: '签订年份', filterType: 'select', filterOptions: yearOptions(1990, 10) },
    { key: 'effectiveStart', title: '生效开始', filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'effectiveEnd', title: '生效结束', filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'expiryDate', title: '到期日期', filterType: 'date', render: (v) => fmtDate(v) || '—' },
    {
      key: 'salesOwnerName',
      title: '销售负责人',
      accessor: (r) => r.salesOwner?.name,
    },
    {
      key: 'deliveryOwnerName',
      title: '交付负责人',
      accessor: (r) => r.deliveryOwner?.name,
    },
    {
      key: 'invoices',
      title: '发票',
      sortable: false,
      accessor: (r) =>
        (r.invoices ?? [])
          .map((x: any) => [x.invoiceType, x.verificationResult].filter(Boolean).join(' '))
          .filter(Boolean)
          .join(' '),
      render: (_v, r) => (
        <SubTableCell
          rows={r.invoices}
          title="发票"
          unit="条"
          columns={[
            { key: 'invoiceType', title: '发票类型' },
            { key: 'verificationResult', title: '查验结果' },
          ]}
        />
      ),
    },
    {
      key: 'createdAt',
      title: '创建时间',
      defaultVisible: false,
      filterType: 'date',
      render: (v) => <span className="text-base-content/60">{fmtDate(v)}</span>,
    },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'customerId', title: '客户 ID', defaultVisible: false, filterType: 'number' },
    { key: 'headhunterFeeRate', title: '猎头服务费率%', defaultVisible: false, filterType: 'number', render: (v) => (v ?? '') === '' ? '—' : String(v) },
    { key: 'billingMonths', title: '计费月数', defaultVisible: false, filterType: 'number' },
    { key: 'ropFeeRate', title: 'ROP 服务费率', defaultVisible: false, filterType: 'number', render: (v) => (v ?? '') === '' ? '—' : String(v) },
    { key: 'salesOwnerId', title: '销售负责人 ID', defaultVisible: false, filterType: 'number' },
    { key: 'deliveryOwnerId', title: '交付负责人 ID', defaultVisible: false, filterType: 'number' },
    { key: 'contractFileUrl', title: '合同附件 URL', defaultVisible: false },
    { key: 'invoiceInfoText', title: '开票信息', defaultVisible: false },
    { key: 'invoiceInfoFileUrl', title: '开票信息（文件）', defaultVisible: false, sortable: false, render: (v) => v ? '已上传' : '—' },
    { key: 'notes', title: '备注', defaultVisible: false },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">销售合同</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理所有销售合同及发票信息</p>
      </div>

      <BoostTable
        title="合同列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索合同名称 / 客户 / 服务类型…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该合同？" onConfirm={() => handleDelete(r.id)}>
                <button className="btn btn-ghost btn-xs gap-1 text-error">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      <Modal
        open={open}
        title={editing ? '编辑合同' : '新增合同'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={760}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="关联客户" required>
            <SearchSelect
              value={String(form.customerId ?? '')}
              onChange={(v) => setField('customerId', v)}
              fetchOptions={searchFetch('/api/clients/options', (c) => ({ value: String(c.id), label: c.shortName || c.fullName }))}
              initialLabel={editing?.customer?.shortName ?? ''}
              placeholder="请选择客户"
            />
          </Field>
          <Field label="合同名称" required>
            <input className="input input-bordered w-full" value={form.contractName} onChange={(e) => setField('contractName', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="签订年份" required>
            <YearSelect value={form.signingYear} onChange={(v) => setField('signingYear', v)} minYear={1990} maxFuture={10} />
          </Field>
          <Field label="合同有效期" required className="col-span-2">
            <div className="flex items-center gap-2">
              <input type="date" className="input input-bordered w-full" value={form.effectiveStart} onChange={(e) => setField('effectiveStart', e.target.value)} placeholder="起始日期" />
              <span className="text-base-content/40">-</span>
              <input type="date" className="input input-bordered w-full" value={form.effectiveEnd} onChange={(e) => setField('effectiveEnd', e.target.value)} placeholder="结束日期" />
            </div>
          </Field>
          <Field label="合同到期日期" required>
            <input type="date" className="input input-bordered w-full" value={form.expiryDate} onChange={(e) => setField('expiryDate', e.target.value)} />
          </Field>
          <Field label="服务类型" required>
            <SearchSelect value={form.serviceType} onChange={(v) => setField('serviceType', v)} options={serviceTypeOptions} placeholder="请选择" />
          </Field>
          <Field label="猎头服务费率%">
            <input type="number" className="input input-bordered w-full" value={form.headhunterFeeRate} onChange={(e) => setField('headhunterFeeRate', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="计费月数">
            <input type="number" className="input input-bordered w-full" value={form.billingMonths} onChange={(e) => setField('billingMonths', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="ROP 服务费率">
            <input type="number" className="input input-bordered w-full" value={form.ropFeeRate} onChange={(e) => setField('ropFeeRate', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="销售负责人">
            <SearchSelect
              value={String(form.salesOwnerId ?? '')}
              onChange={(v) => setField('salesOwnerId', v)}
              fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
              initialLabel={editing?.salesOwner?.name ?? ''}
              placeholder="请选择销售负责人"
            />
          </Field>
          <Field label="交付负责人">
            <SearchSelect
              value={String(form.deliveryOwnerId ?? '')}
              onChange={(v) => setField('deliveryOwnerId', v)}
              fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
              initialLabel={editing?.deliveryOwner?.name ?? ''}
              placeholder="请选择交付负责人"
            />
          </Field>
          <Field label="合同附件" required className="col-span-2">
            <FileUpload value={form.contractFileUrl} onChange={(url) => setField('contractFileUrl', url)} />
          </Field>
          <Field label="开票信息" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.invoiceInfoText} onChange={(e) => setField('invoiceInfoText', e.target.value)} placeholder="开票相关信息" />
          </Field>
          <Field label="开票信息（文件）" className="col-span-2">
            <FileUpload value={form.invoiceInfoFileUrl} onChange={(url) => setField('invoiceInfoFileUrl', url)} />
          </Field>
          <Field label="备注" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="其他备注信息" />
          </Field>
        </div>

        <div className="divider my-3" />

        <SubTable
          title="发票详情"
          value={form.invoices}
          onChange={(rows) => setField('invoices', rows)}
          columns={[
            { key: 'invoiceType', title: '发票类型', type: 'select', options: invoiceTypeOptions, width: 240 },
            { key: 'verificationResult', title: '查验结果', type: 'select', options: verificationResultOptions, width: 240 },
          ]}
        />
      </Modal>
    </div>
  )
}
