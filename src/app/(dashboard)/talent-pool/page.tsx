'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, FileUpload, YearSelect, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'TALENT_POOL'

const GENDER_LABELS: Record<string, string> = { MALE: '男', FEMALE: '女', ANY: '不限' }

const EMPTY_FORM: any = {
  name: '', gender: '', birthYear: '', age: '', education: '', phone: '',
  currentPosition: '', targetPosition: '', positionType: '', positionLevel: '',
  tags: '', resumeUrl: '',
}

export default function TalentPoolPage() {
  const toast = useToast()
  const { can, isOwner } = useMyPermissions()
  const { items: talentIndustryOptions } = useDict('talent_industry')
  const { items: positionLevelOptions } = useDict('position_level')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/talent-pool')
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
      gender: r.gender ?? '',
      birthYear: r.birthYear ?? '',
      age: r.age ?? '',
      tags: Array.isArray(r.tags) ? r.tags.join(', ') : '',
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/talent-pool/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.name?.trim()) return toast.error('请填写人才姓名')
    if (!form.currentPosition?.trim()) return toast.error('请填写当前职位')
    if (!form.resumeUrl?.trim()) return toast.error('请填写简历URL')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        tags: String(form.tags || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }
      const url = editing ? `/api/talent-pool/${editing.id}` : '/api/talent-pool'
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
    { key: 'name', title: '姓名', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'gender', title: '性别', accessor: (r) => GENDER_LABELS[r.gender] ?? '',
      filterType: 'select', filterOptions: Object.values(GENDER_LABELS).map((l) => ({ label: l, value: l })) },
    { key: 'currentPosition', title: '当前职位' },
    { key: 'targetPosition', title: '意向职位' },
    { key: 'positionType', title: '所属行业', filterType: 'select', filterOptions: talentIndustryOptions },
    { key: 'positionLevel', title: '职位级别', filterType: 'select', filterOptions: positionLevelOptions },
    { key: 'education', title: '学历', filterType: 'select',
      filterOptions: ['大专', '本科', '硕士', '博士'].map((l) => ({ label: l, value: l })) },
    { key: 'phone', title: '电话' },
    { key: 'birthYear', title: '出生年份', defaultVisible: false, filterType: 'number' },
    { key: 'age', title: '年龄', defaultVisible: false, filterType: 'number' },
    { key: 'resumeUrl', title: '简历URL', defaultVisible: false,
      render: (v) => v ? <a href={v} target="_blank" rel="noreferrer" className="link link-primary line-clamp-1 max-w-[200px]">{v}</a> : <span className="text-base-content/30">—</span> },
    { key: 'tags', title: '人才标签', sortable: false,
      accessor: (r) => (Array.isArray(r.tags) ? r.tags.join(' ') : ''),
      render: (_v, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.tags ?? []).map((t: string, i: number) => (
            <span key={i} className="badge badge-ghost badge-sm">{t}</span>
          ))}
        </div>
      ) },
    { key: 'createdAt', title: '创建时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, filterType: 'date', render: (v) => v?.slice(0, 10) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">人才储备库</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理储备人才信息及简历资料</p>
      </div>

      <BoostTable
        title="人才列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新建人才"
        onImport={can(RES, 'IMPORT') ? () => toast.info('导入功能开发中') : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索姓名 / 职位 / 标签…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该人才？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑人才' : '新建人才'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={720}
      >
        <div className="grid grid-cols-2 gap-4">
          {/* 人才姓名 / 出生年份 */}
          <Field label="人才姓名" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="出生年份">
            <YearSelect value={form.birthYear} onChange={(v) => setField('birthYear', v)} minYear={1950} />
          </Field>
          {/* 最高学历 / 性别 */}
          <Field label="最高学历">
            <select className="select select-bordered w-full" value={form.education} onChange={(e) => setField('education', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              <option value="大专">大专</option>
              <option value="本科">本科</option>
              <option value="硕士">硕士</option>
              <option value="博士">博士</option>
            </select>
          </Field>
          <Field label="性别">
            <select className="select select-bordered w-full" value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              <option value="MALE">男</option>
              <option value="FEMALE">女</option>
            </select>
          </Field>
          {/* 联系电话 / 当前职位 */}
          <Field label="联系电话">
            <input className="input input-bordered w-full" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="当前职位" required>
            <input className="input input-bordered w-full" value={form.currentPosition} onChange={(e) => setField('currentPosition', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 意向职位 / 职位类型 */}
          <Field label="意向职位">
            <input className="input input-bordered w-full" value={form.targetPosition} onChange={(e) => setField('targetPosition', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="所属行业">
            <select className="select select-bordered w-full" value={form.positionType} onChange={(e) => setField('positionType', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              {talentIndustryOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          {/* 职位级别 / 简历及相关资料 */}
          <Field label="职位级别">
            <select className="select select-bordered w-full" value={form.positionLevel} onChange={(e) => setField('positionLevel', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              {positionLevelOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="简历及相关资料" required>
            <FileUpload value={form.resumeUrl} onChange={(url) => setField('resumeUrl', url)} />
          </Field>
          {/* 年龄 / 人才标签 */}
          <Field label="年龄">
            <input type="number" className="input input-bordered w-full" value={form.age} onChange={(e) => setField('age', e.target.value)} placeholder="请输入数字" />
          </Field>
          <Field label="人才标签（逗号分隔）">
            <input className="input input-bordered w-full" value={form.tags} onChange={(e) => setField('tags', e.target.value)} placeholder="请输入" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
