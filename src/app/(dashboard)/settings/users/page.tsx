'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2, ArrowRightLeft } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const EMPTY_FORM: any = {
  name: '', username: '', email: '', password: '', departmentId: '', roleId: '',
}

export default function UsersPage() {
  const toast = useToast()
  const { isAdmin } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  // 移交权限
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [transferSource, setTransferSource] = useState<any>(null)
  const [transferTargetId, setTransferTargetId] = useState('')

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // showLoading=false 时不在 effect 同步路径触发 setLoading（规避 react-hooks/set-state-in-effect），
  // loading 初值即 true，加载完成后在 finally 置 false。
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      const json = await res.json()
      setData(json.data)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('加载失败'))
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
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('加载部门 / 角色失败'))
    }
  }, [toast])

  useEffect(() => {
    void (async () => {
      await fetchData()
      await fetchOptions()
    })()
  }, [fetchData, fetchOptions])

  const openTransfer = (r: any) => {
    setTransferSource(r)
    setTransferTargetId('')
    setTransferOpen(true)
  }

  const handleTransfer = async () => {
    if (!transferSource) return
    if (!transferTargetId) return toast.error('请选择接收数据的目标用户')
    setTransferring(true)
    try {
      const res = await fetch(`/api/users/${transferSource.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: Number(transferTargetId) }),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('已移交该用户创建的全部数据')
      setTransferOpen(false)
      void fetchData(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('移交失败'))
    } finally {
      setTransferring(false)
    }
  }

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
      username: r.username ?? '',
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
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写用户名')
    if (!form.username?.trim()) return toast.error('请填写账号')
    if (!editing && !form.password?.trim()) return toast.error('请填写密码')
    setSubmitting(true)
    try {
      const payload: any = {
        name: form.name,
        username: form.username,
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
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchData(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : (editing ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns: BoostColumn<any>[] = [
    { key: 'id', title: 'ID', width: 70, filterType: 'number' },
    { key: 'name', title: '用户名', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'username', title: '账号' },
    { key: 'email', title: '邮箱' },
    // 部门 / 角色：列 accessor 输出名称，filterOptions 的 value 必须等于该名称（取自下拉数据源 departments / roles）
    { key: 'departmentName', title: '部门', accessor: (r) => r.department?.name,
      filterType: 'select', filterOptions: departments.map((d) => ({ label: d.name, value: d.name })) },
    { key: 'roleName', title: '角色', accessor: (r) => r.role?.name,
      filterType: 'select', filterOptions: roles.map((r) => ({ label: r.name, value: r.name })),
      render: (v) => v ? <span className="badge badge-info badge-sm">{v}</span> : <span className="text-base-content/30">—</span> },
    // 是否管理员：补 accessor 输出 是/否，使 filterOptions 的 value 与该列取值一致
    { key: 'isAdmin', title: '管理员', defaultVisible: false,
      accessor: (r) => (r.isAdmin ? '是' : '否'),
      filterType: 'select', filterOptions: [{ label: '是', value: '是' }, { label: '否', value: '否' }],
      render: (v) => v === '是' ? <span className="badge badge-warning badge-sm">是</span> : <span className="text-base-content/50">否</span> },
    { key: 'departmentId', title: '部门 ID', defaultVisible: false, filterType: 'number' },
    { key: 'roleId', title: '角色 ID', defaultVisible: false, filterType: 'number' },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
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
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索用户名 / 邮箱 / 部门 / 角色…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            {isAdmin && (
              <button className="btn btn-ghost btn-xs gap-1 text-secondary" onClick={() => openTransfer(r)}>
                <ArrowRightLeft className="h-3.5 w-3.5" />
                移交权限
              </button>
            )}
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
          <Field label="账号" required>
            <input className="input input-bordered w-full" value={form.username} onChange={(e) => setField('username', e.target.value)} placeholder="登录账号，如 zhangsan" />
          </Field>
          <Field label="邮箱(选填)">
            <input type="email" className="input input-bordered w-full" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="密码" required={!editing}>
            <input type="password" className="input input-bordered w-full" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder={editing ? '留空则不修改' : '请输入'} />
          </Field>
          <Field label="部门">
            <select className="select select-bordered w-full" value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="角色">
            <select className="select select-bordered w-full" value={form.roleId} onChange={(e) => setField('roleId', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* 移交权限：将该用户创建的全部数据移交给目标用户 */}
      <Modal
        open={transferOpen}
        title="移交权限"
        onClose={() => setTransferOpen(false)}
        onOk={handleTransfer}
        okText="确认移交"
        confirmLoading={transferring}
        width={480}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-base-200 px-3 py-2.5 text-sm text-base-content/70">
            将
            <span className="mx-1 font-medium text-base-content">
              {transferSource?.name ?? ''}
            </span>
            创建的全部数据移交给所选目标用户，此操作不可撤销。
          </div>
          <Field label="目标用户" required>
            <select
              className="select select-bordered w-full"
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
            >
              <option value="" disabled hidden>请选择</option>
              {data
                .filter((u) => u.id !== transferSource?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? `（${u.email}）` : ''}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
