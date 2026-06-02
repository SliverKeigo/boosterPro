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
  RichText,
  Dropdown,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'KNOWLEDGE'

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
  const { can, isOwner } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const { items: categoryOptions } = useDict('knowledge_category')
  const { items: tagOptions } = useDict('knowledge_tag')

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/knowledge')
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
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
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
    // 知识分类：表单用 useDict('knowledge_category') 下拉，列无 accessor 比较原始值（字典 value）→ 用同一份字典项
    { key: 'category', title: '知识分类', filterType: 'select', filterOptions: categoryOptions, render: (v) => <span className="font-medium">{v}</span> },
    {
      key: 'tags',
      title: '标签',
      sortable: false,
      // 标签为多值数组，accessor 拼接成字符串；按自由文本筛选（包含匹配单个标签）
      filterType: 'text',
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
      key: 'managementRecords',
      title: '管理细则',
      sortable: false,
      accessor: (r) => (r.managementRecords ?? []).map((m: any) => m.details).filter(Boolean).join('；'),
      render: (_v, r) => (
        <SubTableCell
          rows={r.managementRecords}
          title="管理细则"
          unit="条"
          columns={[
            { key: 'date', title: '日期', render: (v) => fmtDate(v) },
            { key: 'submitterId', title: '提交人 ID' },
            { key: 'details', title: '细则内容' },
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
    { key: 'fileUrl', title: '知识文件 URL', defaultVisible: false },
    { key: 'notes', title: '知识便条', defaultVisible: false, render: (v) => stripHtml(v) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => <span className="text-base-content/60">{fmtDate(v)}</span> },
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
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        onImport={can(RES, 'IMPORT') ? () => toast.info('导入功能开发中') : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索分类 / 标签 / 关键词…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该知识条目？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑知识' : '新增知识'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="知识分类" required>
            <select className="select select-bordered w-full" value={form.category} onChange={(e) => setField('category', e.target.value)}>
              <option value="" disabled hidden>请选择分类</option>
              {categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="知识标签" required>
            {(() => {
              const selected = new Set(
                String(form.tags || '')
                  .split(/[,、]/)
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              )
              const toggle = (val: string, checked: boolean) => {
                if (checked) selected.add(val)
                else selected.delete(val)
                setField(
                  'tags',
                  tagOptions
                    .map((o) => o.value)
                    .filter((v) => selected.has(v))
                    .join(', '),
                )
              }
              const selectedLabels = tagOptions
                .filter((o) => selected.has(o.value))
                .map((o) => o.label)
              return (
                <Dropdown
                  align="left"
                  width={300}
                  className="w-full"
                  trigger={
                    <span className="select select-bordered flex w-full cursor-pointer items-center font-normal">
                      <span className={selectedLabels.length ? 'truncate' : 'truncate text-base-content/40'}>
                        {selectedLabels.length ? selectedLabels.join('、') : '请选择标签'}
                      </span>
                    </span>
                  }
                >
                  <div className="max-h-64 overflow-auto">
                    {tagOptions.map((o) => (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={selected.has(o.value)}
                          onChange={(e) => toggle(o.value, e.target.checked)}
                        />
                        <span className="text-sm">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </Dropdown>
              )
            })()}
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
