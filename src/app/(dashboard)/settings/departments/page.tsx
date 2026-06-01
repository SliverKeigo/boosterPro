'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'

const EMPTY_FORM: any = { name: '' }

export default function DepartmentsPage() {
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
      const res = await fetch('/api/departments')
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
    setForm({ ...EMPTY_FORM, name: r.name ?? '' })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '删除失败')
        return
      }
      toast.success('删除成功')
      void fetchData()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写部门名称')
    setSubmitting(true)
    try {
      const url = editing ? `/api/departments/${editing.id}` : '/api/departments'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name }),
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
    { key: 'name', title: '部门名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'userCount', title: '用户数', accessor: (r) => r._count?.users ?? 0,
      render: (v) => <span className="badge badge-ghost badge-sm">{v}</span> },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, render: (v) => v?.slice(0, 10) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">部门管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理组织部门</p>
      </div>

      <BoostTable
        title="部门列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增部门"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={fetchData}
        searchPlaceholder="搜索部门名称…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该部门？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑部门' : '新增部门'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={480}
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="部门名称" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
