'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  Modal,
  Popconfirm,
  Field,
  FileUpload,
  RichText,
  useToast,
} from '@/components/ui'

const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
// 富文本字段去 HTML 标签后截断显示
const stripHtml = (v?: string | null) => (v ? v.replace(/<[^>]+>/g, '').slice(0, 40) : '—')

const EMPTY_FORM: any = {
  category: '',
  tags: '',
  keywords: '',
  fileUrl: '',
  notes: '',
  managementRecords: [],
}

export default function KnowledgePage() {
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
      const res = await fetch('/api/knowledge')
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
    setForm({
      ...EMPTY_FORM,
      ...r,
      tags: Array.isArray(r.tags) ? r.tags.join(', ') : '',
      managementRecords: (r.managementRecords ?? []).map((x: any) => ({
        date: fmtDate(x.date),
        submitterId: x.submitterId ?? '',
        details: x.details ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('删除成功')
      void fetchData()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.category?.trim()) return toast.error('请填写知识分类')
    if (!form.keywords?.trim()) return toast.error('请填写关键词')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        tags: String(form.tags || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }
      const url = editing ? `/api/knowledge/${editing.id}` : '/api/knowledge'
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
    { key: 'category', title: '知识分类', render: (v) => <span className="font-medium">{v}</span> },
    {
      key: 'tags',
      title: '标签',
      sortable: false,
      accessor: (r) => (Array.isArray(r.tags) ? r.tags.join(' ') : ''),
      render: (_v, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.tags ?? []).map((t: string, i: number) => (
            <span key={i} className="badge badge-ghost badge-sm">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'keywords',
      title: '关键词',
      render: (v) =>
        v ? <span className="line-clamp-1 max-w-[260px]">{v}</span> : <span className="text-base-content/30">—</span>,
    },
    {
      key: 'recordsCount',
      title: '管理细则数',
      sortable: false,
      accessor: (r) => (r.managementRecords ?? []).length,
      render: (v) => <span className="badge badge-ghost badge-sm">{v}</span>,
    },
    {
      key: 'createdAt',
      title: '创建时间',
      defaultVisible: false,
      render: (v) => <span className="text-base-content/60">{fmtDate(v)}</span>,
    },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'fileUrl', title: '知识文件 URL', defaultVisible: false },
    { key: 'notes', title: '知识便条', defaultVisible: false, render: (v) => stripHtml(v) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">公司知识库</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理公司知识分类、标签及管理细则</p>
      </div>

      <BoostTable
        title="知识列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={openCreate}
        createText="新增"
        onImport={() => toast.info('导入功能开发中')}
        onRefresh={fetchData}
        searchPlaceholder="搜索分类 / 标签 / 关键词…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <Popconfirm title="确认删除该知识条目？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑知识' : '新增知识'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="知识分类" required>
            <input className="input input-bordered w-full" value={form.category} onChange={(e) => setField('category', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="知识标签（逗号分隔）" required>
            <input className="input input-bordered w-full" value={form.tags} onChange={(e) => setField('tags', e.target.value)} placeholder="如：制度, 流程, 模板" />
          </Field>
          <Field label="关键词" required>
            <input className="input input-bordered w-full" value={form.keywords} onChange={(e) => setField('keywords', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="知识文件">
            <FileUpload value={form.fileUrl} onChange={(url) => setField('fileUrl', url)} />
          </Field>
          <Field label="知识便条" className="col-span-2">
            <RichText value={form.notes} onChange={(html) => setField('notes', html)} />
          </Field>
        </div>

        <div className="divider my-3" />

        <SubTable
          title="管理细则"
          value={form.managementRecords}
          onChange={(rows) => setField('managementRecords', rows)}
          columns={[
            { key: 'date', title: '日期', type: 'date', width: 160 },
            { key: 'submitterId', title: '提交人 ID', type: 'number', width: 120 },
            { key: 'details', title: '细则内容', type: 'textarea', width: 320 },
          ]}
        />
      </Modal>
    </div>
  )
}
