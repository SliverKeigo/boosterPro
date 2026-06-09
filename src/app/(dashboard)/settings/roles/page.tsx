'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Eye, Trash2, ShieldAlert } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'

const EMPTY_FORM: any = { name: '', description: '' }

export default function RolesPage() {
  const toast = useToast()
  const { isAdmin, loading: permLoading } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  // 查看角色用户弹窗
  const [usersOpen, setUsersOpen] = useState(false)
  const [usersRole, setUsersRole] = useState<any>(null)
  const [roleUsers, setRoleUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/roles')
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
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setForm({ ...EMPTY_FORM, name: r.name ?? '', description: r.description ?? '' })
    setOpen(true)
  }

  // 查看拥有该角色的用户（管理员页，/api/users 返回全量，前端按 roleId 过滤）
  const openUsers = async (role: any) => {
    setUsersRole(role)
    setRoleUsers([])
    setUsersLoading(true)
    setUsersOpen(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      const json = await res.json()
      setRoleUsers((json.data || []).filter((u: any) => u.roleId === role.id))
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载失败')
    } finally {
      setUsersLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '删除失败')
        return
      }
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写角色名称')
    setSubmitting(true)
    try {
      const url = editing ? `/api/roles/${editing.id}` : '/api/roles'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description }),
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

  // 权限校验中
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  // 非管理员
  if (!isAdmin) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">角色管理</h1>
          <p className="mt-0.5 text-sm text-base-content/50">管理系统角色及权限说明</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">仅管理员可访问</p>
          </div>
        </div>
      </div>
    )
  }

  const columns: BoostColumn<any>[] = [
    { key: 'id', title: 'ID', width: 70, filterType: 'number' },
    { key: 'name', title: '角色名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'description', title: '描述',
      render: (v) => v ? <span className="line-clamp-1 max-w-[280px]">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'userCount', title: '用户数', accessor: (r) => r._count?.users ?? 0, filterType: 'number',
      render: (v, r) => <button type="button" onClick={() => openUsers(r)} className="cursor-pointer font-medium text-primary hover:underline" title="点击查看拥有该角色的用户">{v}</button> },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">角色管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理系统角色及权限说明</p>
      </div>

      <BoostTable
        title="角色列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增角色"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索角色名称 / 描述…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
            <Popconfirm title="确认删除该角色？" onConfirm={() => handleDelete(r.id)}>
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
        title={mode === 'view' ? '角色详情' : editing ? '编辑角色' : '新增角色'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={isAdmin ? () => setMode('edit') : undefined}
        width={560}
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="角色名称" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="描述">
            <textarea className="textarea textarea-bordered w-full" rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="角色职责说明" />
          </Field>
        </div>
      </Modal>

      {/* 查看角色用户 */}
      <Modal
        open={usersOpen}
        title={`${usersRole?.name ?? '角色'} · 用户（${roleUsers.length}）`}
        onClose={() => setUsersOpen(false)}
        footer={null}
        width={640}
      >
        {usersLoading ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        ) : roleUsers.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/50">该角色暂无用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>账号</th>
                  <th>部门</th>
                  <th>邮箱</th>
                </tr>
              </thead>
              <tbody>
                {roleUsers.map((u: any) => (
                  <tr key={u.id}>
                    <td className="font-medium">
                      {u.name}
                      {u.isAdmin && <span className="badge badge-primary badge-xs ml-1">管理员</span>}
                    </td>
                    <td>{u.username}</td>
                    <td>{u.department?.name ?? '—'}</td>
                    <td className="text-base-content/60">{u.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
