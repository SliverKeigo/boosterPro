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
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { refGet } from '@/lib/refCache'

const RES = 'CUSTOMER_CONTACT'

const fmtDateTime = (s?: string | null) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : '—')

const EMPTY_FORM: any = {
  title: '', customerId: '', submitterId: '', submitDepartmentId: '',
  contacts: [],
}

export default function CustomerContactsPage() {
  const toast = useToast()
  const { can, canEditRow, userId, departmentId } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // 表单引用数据按需加载：打开新增/编辑弹窗时再拉（refGet 按 url 缓存 60s + 在途去重，已缓存则瞬时）
  // 提交人组织 / 提交人为联动下拉（组织过滤提交人、提交人回填组织），仍用本地列表做静态选项；
  // 客户改用异步 SearchSelect，按搜索词向后端取，无需在此预载。
  const loadFormRefs = useCallback(async () => {
    const [d, u] = await Promise.all([
      refGet('/api/departments'),
      refGet('/api/users'),
    ])
    setDepartments(d)
    setUsers(u)
  }, [])

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/customer-contacts')
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
    void loadFormRefs()
    setEditing(null)
    setMode('edit')
    // 提交人 / 提交人组织默认填当前登录用户（仍可在下拉中改）
    setForm({
      ...EMPTY_FORM,
      submitterId: userId != null ? String(userId) : '',
      submitDepartmentId: departmentId != null ? String(departmentId) : '',
    })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    void loadFormRefs()
    setEditing(r)
    setMode('view')
    setForm({
      ...EMPTY_FORM,
      ...r,
      customerId: r.customerId ?? '',
      submitterId: r.submitterId ?? '',
      submitDepartmentId: r.submitDepartmentId ?? '',
      contacts: (r.contacts ?? []).map((x: any) => ({
        contactName: x.contactName ?? '',
        contactTitle: x.contactTitle ?? '',
        contactPhone: x.contactPhone ?? '',
        contactEmail: x.contactEmail ?? '',
        contactHobby: x.contactHobby ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/customer-contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.title?.trim()) return toast.error('请填写实例标题')
    if (!form.customerId || String(form.customerId).trim() === '') return toast.error('请选择客户名称')
    setSubmitting(true)
    try {
      const url = editing ? `/api/customer-contacts/${editing.id}` : '/api/customer-contacts'
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
    { key: 'title', title: '实例标题', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'customerName', title: '客户名称', accessor: (r) => r.customer?.shortName,
      render: (v) => v ? <span className="font-medium text-primary">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'submitterName', title: '提报人', accessor: (r) => r.submitter?.name,
      render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'contacts', title: '客户联系人信息', sortable: false,
      accessor: (r) =>
        (r.contacts ?? [])
          .map((x: any) => [x.contactName, x.contactTitle, x.contactPhone, x.contactEmail, x.contactHobby].filter(Boolean).join(' '))
          .filter(Boolean)
          .join(' '),
      render: (_v, r) => (
        <SubTableCell
          rows={r.contacts}
          title="客户联系人信息"
          unit="条"
          columns={[
            { key: 'contactName', title: '联系人姓名' },
            { key: 'contactTitle', title: '联系人职务' },
            { key: 'contactPhone', title: '联系人电话' },
            { key: 'contactEmail', title: '联系人邮箱' },
            { key: 'contactHobby', title: '联系人爱好' },
          ]}
        />
      ) },
    { key: 'createdAt', title: '创建时间', filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在“显示列”开启 —— 覆盖全部字段
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => fmtDateTime(v) },
    { key: 'customerId', title: '客户 ID', defaultVisible: false, filterType: 'number' },
    { key: 'submitterId', title: '提交人 ID', defaultVisible: false, filterType: 'number' },
    { key: 'submitDepartmentId', title: '提交人组织 ID', defaultVisible: false, filterType: 'number' },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">客户联系人信息管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">维护客户联系人姓名、职务、电话、邮箱与爱好</p>
      </div>

      <BoostTable
        title="客户联系人信息列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索标题 / 客户 / 提交人 / 联系人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
            {can(RES, 'DELETE') && canEditRow(RES, r) && (
              <Popconfirm title="确认删除该客户联系人信息？" onConfirm={() => handleDelete(r.id)}>
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
        title={mode === 'view' ? '客户联系人信息详情' : editing ? '编辑客户联系人信息' : '新增客户联系人信息'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={can(RES, 'EDIT') && canEditRow(RES, editing) ? () => setMode('edit') : undefined}
        width={840}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="实例标题" required>
            <input className="input input-bordered w-full" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="客户名称" required>
            <SearchSelect
              value={String(form.customerId ?? '')}
              onChange={(v) => setField('customerId', v)}
              fetchOptions={searchFetch('/api/clients/options', (c) => ({ value: String(c.id), label: c.shortName || c.fullName }))}
              initialLabel={editing?.customer?.shortName ?? ''}
              placeholder="请选择客户"
            />
          </Field>
          <Field label="提交人组织">
            <SearchSelect
              value={String(form.submitDepartmentId ?? '')}
              onChange={(v) => setForm((f: any) => ({ ...f, submitDepartmentId: v, submitterId: '' }))}
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              placeholder="请选择组织"
            />
          </Field>
          <Field label="提交人">
            <SearchSelect
              value={String(form.submitterId ?? '')}
              onChange={(v) => {
                const u = users.find((x) => String(x.id) === v)
                setForm((f: any) => ({
                  ...f,
                  submitterId: v,
                  submitDepartmentId: u?.departmentId != null ? String(u.departmentId) : f.submitDepartmentId,
                }))
              }}
              options={users
                .filter((u) => !form.submitDepartmentId || String(u.departmentId ?? '') === String(form.submitDepartmentId))
                .map((u) => ({ value: String(u.id), label: u.name }))}
              placeholder="请选择提交人"
            />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 子表 */}
        <SubTable
          title="客户联系人信息"
          value={form.contacts}
          onChange={(rows) => setField('contacts', rows)}
          columns={[
            { key: 'contactName', title: '联系人姓名', type: 'text', width: 140 },
            { key: 'contactTitle', title: '联系人职务', type: 'text', width: 140 },
            { key: 'contactPhone', title: '联系人电话', type: 'text', width: 160 },
            { key: 'contactEmail', title: '联系人邮箱', type: 'text', width: 200 },
            { key: 'contactHobby', title: '联系人爱好', type: 'textarea', width: 200 },
          ]}
        />
      </Modal>
    </div>
  )
}
