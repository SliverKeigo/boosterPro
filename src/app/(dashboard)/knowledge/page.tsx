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
  FileUpload,
  RichText,
  Dropdown,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'KNOWLEDGE'

const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
// 富文本字段去 HTML 标签后截断显示
const stripHtml = (v?: string | null) => (v ? v.replace(/<[^>]+>/g, '').slice(0, 40) : '—')

// ─── 条件显隐：知识分类 / 知识标签 → 额外字段（仿候选人页 STATUS_FIELDS / visible()） ───
// 字典项 value === label（见 seed），故直接以中文取值比较。
const CATEGORY_TRAINING = '培训资料' // 额外显示：培训提纲 / 内部讲师 / 外部讲师
const CATEGORY_NOTE = '知识便条' // 额外显示：知识便条（富文本 notes）
const TAG_MANAGEMENT = '管理知识' // 额外显示：管理细则子表（managementRecords）

// 受条件驱动的字段全集（提交前用于清除当前条件不显示的字段，避免脏数据）。
// 子表（managementRecords）清成 []，内部讲师 id 清成 ''，其余字符串清成 ''。
const CONDITIONAL_FIELDS = [
  'trainingOutline',
  'internalLecturerId',
  'externalLecturer',
  'notes',
  'managementRecords',
] as const

const EMPTY_FORM: any = {
  category: '',
  tags: '',
  keywords: '',
  fileUrl: '',
  notes: '',
  trainingOutline: '',
  internalLecturerId: '',
  // 异步 SearchSelect 编辑回显用（仅前端展示，提交前剔除，不入库）
  internalLecturerName: '',
  externalLecturer: '',
  managementRecords: [],
}

export default function KnowledgePage() {
  const toast = useToast()
  const { can, isOwner } = useMyPermissions()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const { items: categoryOptions } = useDict('knowledge_category')
  const { items: tagOptions } = useDict('knowledge_tag')

  // 当前表单选中的标签集合
  const selectedTags = (): Set<string> =>
    new Set(
      String(form.tags || '')
        .split(/[,、]/)
        .map((s: string) => s.trim())
        .filter(Boolean),
    )

  // 某条件字段在当前「分类 / 标签」下是否应显示
  const visible = (field: string): boolean => {
    switch (field) {
      case 'trainingOutline':
      case 'internalLecturerId':
      case 'externalLecturer':
        return form.category === CATEGORY_TRAINING
      case 'notes':
        return form.category === CATEGORY_NOTE
      case 'managementRecords':
        return selectedTags().has(TAG_MANAGEMENT)
      default:
        return false
    }
  }

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
    setMode('edit')
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setForm({
      ...EMPTY_FORM,
      ...r,
      tags: Array.isArray(r.tags) ? r.tags.join(', ') : '',
      trainingOutline: r.trainingOutline ?? '',
      internalLecturerId: r.internalLecturerId ?? '',
      internalLecturerName: r.internalLecturer?.name ?? '',
      externalLecturer: r.externalLecturer ?? '',
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
    if (selectedTags().size === 0) return toast.error('请选择知识标签')
    if (!form.keywords?.trim()) return toast.error('请填写关键词')
    setSubmitting(true)
    try {
      const payload: any = {
        ...form,
        tags: String(form.tags || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }
      // internalLecturerName 仅供前端异步下拉回显，非库字段，提交前剔除
      delete payload.internalLecturerName
      // 清除当前「分类 / 标签」下不显示的条件字段，避免脏数据入库。
      // 子表清成 []（而非 ''），内部讲师 id 清成 ''，其余字符串清成 ''。
      for (const f of CONDITIONAL_FIELDS) {
        if (visible(f)) continue
        payload[f] = f === 'managementRecords' ? [] : ''
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
    { key: 'createdByName', title: '提交人', accessor: (r) => r.createdBy?.name ?? '—', filterType: 'text' },
    { key: 'createdByDept', title: '部门', accessor: (r) => r.createdBy?.department?.name ?? '—', filterType: 'text' },
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
    { key: 'trainingOutline', title: '培训提纲', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[260px]">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'internalLecturer', title: '内部讲师', defaultVisible: false, sortable: false, accessor: (r) => r.internalLecturer?.name ?? '', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'externalLecturer', title: '外部讲师', defaultVisible: false, render: (v) => v || <span className="text-base-content/30">—</span> },
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
        importResource={can(RES, 'IMPORT') ? RES : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索分类 / 标签 / 关键词…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />
              详情
            </button>
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
        title={mode === 'view' ? '知识详情' : editing ? '编辑知识' : '新增知识'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={can(RES, 'EDIT') && isOwner(editing) ? () => setMode('edit') : undefined}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="知识分类" required>
            <SearchSelect value={form.category} onChange={(v) => setField('category', v)} options={categoryOptions} placeholder="请选择分类" />
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

          {/* 分类=培训资料：额外显示 培训提纲 / 内部讲师 / 外部讲师（均非必填） */}
          {visible('trainingOutline') && (
            <Field label="培训提纲" className="col-span-2">
              <textarea className="textarea textarea-bordered w-full" rows={3} value={form.trainingOutline} onChange={(e) => setField('trainingOutline', e.target.value)} placeholder="请填写培训提纲" />
            </Field>
          )}
          {visible('internalLecturerId') && (
            <Field label="内部讲师">
              <SearchSelect
                value={form.internalLecturerId ? String(form.internalLecturerId) : ''}
                onChange={(v) => setField('internalLecturerId', v)}
                fetchOptions={searchFetch('/api/users', (u) => ({ value: String(u.id), label: u.name }))}
                initialLabel={form.internalLecturerName || ''}
                placeholder="请选择内部讲师"
              />
            </Field>
          )}
          {visible('externalLecturer') && (
            <Field label="外部讲师">
              <input className="input input-bordered w-full" value={form.externalLecturer} onChange={(e) => setField('externalLecturer', e.target.value)} placeholder="请输入外部讲师姓名" />
            </Field>
          )}

          {/* 分类=知识便条：额外显示 知识便条（富文本，非必填） */}
          {visible('notes') && (
            <Field label="知识便条" className="col-span-2">
              <RichText value={form.notes} onChange={(html) => setField('notes', html)} />
            </Field>
          )}
        </div>

        {/* 标签含「管理知识」：额外显示 管理细则子表（非必填） */}
        {visible('managementRecords') && (
          <>
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
          </>
        )}
      </Modal>
    </div>
  )
}
