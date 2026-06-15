'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Eye, Trash2, ShieldAlert, X } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, SearchSelect, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const EMPTY_FORM: any = { name: '', departmentId: '', leaderId: '', memberIds: [] as number[] }

export default function GroupsPage() {
  const toast = useToast()
  const { can, loading: permLoading } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<{ id: number; name: string; departmentId: number | null }[]>([])
  const [allDepts, setAllDepts] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const userName = (id: number) => allUsers.find((u) => u.id === id)?.name ?? `#${id}`

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/groups')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      const json = await res.json()
      setData(json.data)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  // 一次性拉全部用户 / 部门，供下拉（静态过滤，避免依赖后端 ?q=）
  const fetchRefs = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([fetch('/api/users'), fetch('/api/departments')])
      if (u.ok) setAllUsers((await u.json()).data.map((x: any) => ({ id: x.id, name: x.name, departmentId: x.departmentId ?? x.department?.id ?? null })))
      if (d.ok) setAllDepts((await d.json()).data.map((x: any) => ({ id: x.id, name: x.name })))
    } catch {
      /* 忽略：下拉为空时仍可手填，不阻断主流程 */
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await Promise.all([fetchData(), fetchRefs()])
    })()
  }, [fetchData, fetchRefs])

  const openCreate = () => {
    setEditing(null)
    setMode('edit')
    setForm({ ...EMPTY_FORM, memberIds: [] })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setForm({
      name: r.name ?? '',
      departmentId: r.departmentId != null ? String(r.departmentId) : (r.department?.id ? String(r.department.id) : ''),
      leaderId: r.leaderId != null ? String(r.leaderId) : (r.leader?.id ? String(r.leader.id) : ''),
      memberIds: Array.isArray(r.members) ? r.members.map((m: any) => m.id) : [],
    })
    setOpen(true)
  }

  const addMember = (v: string) => {
    const id = Number(v)
    if (!id || form.memberIds.includes(id)) return
    setField('memberIds', [...form.memberIds, id])
  }
  const removeMember = (id: number) => {
    setField('memberIds', form.memberIds.filter((x: number) => x !== id))
    if (String(id) === String(form.leaderId)) setField('leaderId', '') // 组长被移出则清空
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || '删除失败')
        return
      }
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写组名称')
    if (!form.departmentId) return toast.error('请选择所属部门')
    if (form.leaderId && !form.memberIds.includes(Number(form.leaderId))) {
      return toast.error('组长必须是该组成员')
    }
    setSubmitting(true)
    try {
      const url = editing ? `/api/groups/${editing.id}` : '/api/groups'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          departmentId: Number(form.departmentId),
          leaderId: form.leaderId ? Number(form.leaderId) : null,
          memberIds: form.memberIds,
        }),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : (editing ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  if (!can('SYS_GROUP', 'VIEW')) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">组管理</h1>
          <p className="mt-0.5 text-sm text-base-content/50">管理部门下的组、成员与组长</p>
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
    { key: 'id', title: 'ID', width: 70, filterType: 'number' },
    { key: 'name', title: '组名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'department', title: '所属部门', accessor: (r) => r.department?.name ?? '—' },
    { key: 'leader', title: '组长', accessor: (r) => r.leader?.name ?? '—' },
    { key: 'memberCount', title: '成员数', accessor: (r) => r._count?.members ?? r.members?.length ?? 0,
      filterType: 'number', render: (v) => <span className="badge badge-ghost badge-sm">{v}</span> },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">组管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理部门下的组、成员与组长（工作计划由各组组长维护）</p>
      </div>

      <BoostTable
        title="组列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        deleteEndpoint="/api/groups"
        canSelectRow={() => can('SYS_GROUP', 'DELETE')}
        onCreate={can('SYS_GROUP', 'CREATE') ? openCreate : undefined}
        createText="新增组"
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索组名…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
            {can('SYS_GROUP', 'DELETE') && (
              <Popconfirm title="确认删除该组？（成员将被移出该组）" onConfirm={() => handleDelete(r.id)}>
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
        title={mode === 'view' ? '组详情' : editing ? '编辑组' : '新增组'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={can('SYS_GROUP', 'EDIT') ? () => setMode('edit') : undefined}
        width={560}
      >
        <div className="grid min-h-[300px] grid-cols-2 content-start gap-4">
          <Field label="组名称" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="如：交付一组" />
          </Field>
          <Field label="所属部门" required>
            <SearchSelect
              value={form.departmentId}
              onChange={(v) => setForm((f: any) => ({ ...f, departmentId: v, memberIds: [], leaderId: '' }))}
              options={allDepts.map((d) => ({ value: String(d.id), label: d.name }))}
              placeholder="请选择部门"
            />
          </Field>
          <Field label="添加成员" className="col-span-2">
            <SearchSelect
              value=""
              onChange={addMember}
              options={allUsers.filter((u) => !form.memberIds.includes(u.id) && !!form.departmentId && u.departmentId === Number(form.departmentId)).map((u) => ({ value: String(u.id), label: u.name }))}
              placeholder={form.departmentId ? '搜索并选择本部门用户加入本组' : '请先选择所属部门'}
            />
            {!form.departmentId && <p className="mt-1 text-xs text-base-content/50">成员从「所属部门」下的用户中选择，请先选部门。</p>}
            {form.memberIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.memberIds.map((id: number) => (
                  <span key={id} className="badge badge-outline gap-1">
                    {userName(id)}
                    <button type="button" onClick={() => removeMember(id)} className="text-error">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="组长" className="col-span-2">
            <SearchSelect
              value={form.leaderId}
              onChange={(v) => setField('leaderId', v)}
              options={form.memberIds.map((id: number) => ({ value: String(id), label: userName(id) }))}
              placeholder="从成员中选择组长"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
