'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'

const EMPTY_FORM: any = {
  name: '', email: '', password: '', departmentId: '', roleId: '',
}

export default function UsersPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json.data)
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const fetchOptions = useCallback(async () => {
    try {
      const [dRes, rRes] = await Promise.all([fetch('/api/departments'), fetch('/api/roles')])
      const [dJson, rJson] = await Promise.all([dRes.json(), rRes.json()])
      setDepartments(dJson.data ?? [])
      setRoles(rJson.data ?? [])
    } catch {
      toast.error('加载部门 / 角色失败')
    }
  }, [toast])

  useEffect(() => {
    void fetchData()
    void fetchOptions()
  }, [fetchData, fetchOptions])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openEdit = (r: any) => {
    setEditing(r)
    setForm({
      ...EMPTY_FORM,
      name: r.name ?? '',
      email: r.email ?? '',
      password: '',
      departmentId: r.departmentId ?? '',
      roleId: r.roleId ?? '',
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('删除成功')
      void fetchData()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写用户名')
    if (!form.email?.trim()) return toast.error('请填写邮箱')
    if (!editing && !form.password?.trim()) return toast.error('请填写密码')
    setSubmitting(true)
    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        departmentId: form.departmentId,
        roleId: form.roleId,
      }
      // 新建必传密码；编辑时仅当填写了密码才更新
      if (form.password?.trim()) payload.password = form.password
      const url = editing ? `/api/users/${editing.id}` : '/api/users'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    { key: 'id', title: 'ID', width: 70 },
    { key: 'name', title: '用户名', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'email', title: '邮箱' },
    { key: 'departmentName', title: '部门', accessor: (r) => r.department?.name },
    { key: 'roleName', title: '角色', accessor: (r) => r.role?.name,
      render: (v) => v ? <span className="badge badge-info badge-sm">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, render: (v) => v?.slice(0, 10) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">用户管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理系统用户及其部门、角色</p>
      </div>

      <BoostTable
        title="用户列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增用户"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={fetchData}
        searchPlaceholder="搜索用户名 / 邮箱 / 部门 / 角色…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑用户' : '新增用户'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={560}
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="用户名" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="邮箱" required>
            <input type="email" className="input input-bordered w-full" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="密码" required={!editing}>
            <input type="password" className="input input-bordered w-full" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder={editing ? '留空则不修改' : '请输入'} />
          </Field>
          <Field label="部门">
            <select className="select select-bordered w-full" value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
              <option value="">请选择</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="角色">
            <select className="select select-bordered w-full" value={form.roleId} onChange={(e) => setField('roleId', e.target.value)}>
              <option value="">请选择</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
