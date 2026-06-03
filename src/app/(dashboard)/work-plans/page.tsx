'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  Modal,
  Popconfirm,
  Field,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { refGet } from '@/lib/refCache'

const STATUS_OPTIONS = ['进行中', '已完成', '暂停', '待开始']
const STATUS_BADGE: Record<string, string> = {
  进行中: 'badge-info',
  已完成: 'badge-success',
  暂停: 'badge-warning',
  待开始: 'badge-ghost',
}

const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')

const EMPTY_FORM: any = {
  title: '',
  ownerId: '',
  // 异步负责人 SearchSelect 回显用（仅前端展示，提交前剔除，不入库）
  ownerName: '',
  startDate: '',
  endDate: '',
  status: '',
  notes: '',
}

export default function WorkPlansPage() {
  const toast = useToast()
  // work-plans 接口要求管理员（requireAdmin），页面同步加 admin 守卫
  const { isAdmin, loading: permLoading, userId } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // 新增时负责人默认预填当前登录用户：异步下拉需要回显名称，但 useMyPermissions 只给 userId、
  // 没有名称——故从 /api/users（refGet 缓存 + 在途去重）解析当前用户名，写入 ownerName 供 initialLabel。
  const resolveCurrentUserName = useCallback(async () => {
    if (userId == null) return
    const list = await refGet('/api/users')
    const me = list.find((u: any) => u.id === userId)
    if (me?.name) setField('ownerName', me.name)
  }, [userId])

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/work-plans')
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
    // 负责人默认填当前登录用户（仍可在下拉中改）
    setForm({ ...EMPTY_FORM, ownerId: userId != null ? String(userId) : '' })
    void resolveCurrentUserName()
    setOpen(true)
  }

  const openEdit = (r: any) => {
    setEditing(r)
    setForm({
      ...EMPTY_FORM,
      ...r,
      title: r.title ?? '',
      ownerId: r.ownerId ?? '',
      ownerName: r.owner?.name ?? '',
      status: r.status ?? '',
      notes: r.notes ?? '',
      startDate: fmtDate(r.startDate),
      endDate: fmtDate(r.endDate),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/work-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // ownerName 仅供前端异步下拉回显，非库字段，提交前剔除
      const payload: any = { ...form }
      delete payload.ownerName
      const url = editing ? `/api/work-plans/${editing.id}` : '/api/work-plans'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    { key: 'title', title: '标题', render: (v) => v ? <span className="font-medium">{v}</span> : <span className="text-base-content/30">—</span> },
    {
      key: 'status',
      title: '状态',
      // 表单用 STATUS_OPTIONS 下拉，列无 accessor 比较原始值（中文状态串），value 与之一致
      filterType: 'select',
      filterOptions: STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
      render: (v) =>
        v ? (
          <span className={`badge ${STATUS_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{v}</span>
        ) : (
          <span className="text-base-content/30">—</span>
        ),
    },
    { key: 'ownerName', title: '负责人', accessor: (r) => r.owner?.name },
    { key: 'startDate', title: '开始日期', filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'endDate', title: '结束日期', filterType: 'date', render: (v) => fmtDate(v) || '—' },
    {
      key: 'createdAt',
      title: '创建时间',
      defaultVisible: false,
      filterType: 'date',
      render: (v) => <span className="text-base-content/60">{fmtDate(v)}</span>,
    },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'ownerId', title: '负责人 ID', defaultVisible: false, filterType: 'number' },
    { key: 'notes', title: '备注', defaultVisible: false },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDate(v)}</span> },
  ]

  // 权限守卫：work-plans 接口要求管理员，非管理员直达页面只显示无权提示
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-base-content/50">
        <span className="loading loading-spinner loading-md" />
        <span className="ml-2">加载中…</span>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center py-24">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body items-center text-center">
            <h2 className="card-title text-base-content">无权访问</h2>
            <p className="text-sm text-base-content/60">该页面仅管理员可访问</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">工作计划</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理团队工作计划与执行状态</p>
      </div>

      <BoostTable
        title="工作计划列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索标题 / 状态 / 负责人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该工作计划？" onConfirm={() => handleDelete(r.id)}>
              <button className="btn btn-ghost btn-xs gap-1 text-error">
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </Popconfirm>
          </div>
        )}
      />

      <Modal
        open={open}
        title={editing ? '编辑工作计划' : '新增工作计划'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={640}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="标题" className="col-span-2">
            <input className="input input-bordered w-full" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="状态">
            <SearchSelect
              value={form.status}
              onChange={(v) => setField('status', v)}
              options={STATUS_OPTIONS.map((o) => ({ value: o, label: o }))}
              placeholder="请选择"
            />
          </Field>
          <Field label="负责人">
            <SearchSelect
              value={form.ownerId ? String(form.ownerId) : ''}
              onChange={(v) => setField('ownerId', v)}
              fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
              initialLabel={form.ownerName || ''}
              placeholder="请选择负责人"
            />
          </Field>
          <Field label="开始日期">
            <input type="date" className="input input-bordered w-full" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
          </Field>
          <Field label="结束日期">
            <input type="date" className="input input-bordered w-full" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} />
          </Field>
          <Field label="备注" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="其他备注信息" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
