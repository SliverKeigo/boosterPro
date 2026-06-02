'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2, Sparkles } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  SubTable,
  Modal,
  Popconfirm,
  Field,
  FileUpload,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'

const RES = 'REQUIREMENT'

// ─── 枚举 / 选项映射 ────────────────────────────────────────────────────────────
const GENDER_LABELS: Record<string, string> = { MALE: '男', FEMALE: '女', ANY: '不限' }

const STATUS_BADGE: Record<string, string> = {
  新增: 'badge-info',
  正常: 'badge-success',
  重启: 'badge-warning',
  暂停: 'badge-ghost',
  加急: 'badge-error',
  关闭: 'badge-neutral',
  售前岗位: 'badge-accent',
}

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }))
const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
const fmtDateTime = (s?: string | null) => (s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : '—')
const num = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v))

const EMPTY_FORM: any = {
  customerId: '', recruiter: '', positionName: '', headcount: '',
  monthlySalaryMin: '', monthlySalaryMax: '', annualSalaryMin: '', annualSalaryMax: '',
  ageMin: '', ageMax: '', genderRequirement: '', educationRequirement: '',
  languageRequirement: '', status: '', deadline: '', baseCity: '',
  jobDescription: '', talentProfile: '', projectExperience: '',
  closeReason: '', notes: '', industry: '',
  followDate: '', latestUpdate: '', attachmentUrl: '',
  positionProfiles: [], urgentRecords: [],
}

export default function RequirementsPage() {
  const toast = useToast()
  const { can, isOwner } = useMyPermissions()
  const { items: statusOptions } = useDict('requirement_status')
  const [data, setData] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleAnalyzeJobProfile = async () => {
    if (!form.jobDescription || !String(form.jobDescription).trim()) return toast.error('请先填写岗位 JD')
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/job-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription: form.jobDescription, positionName: form.positionName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI 分析失败')
      const list = Array.isArray(data.profiles) ? data.profiles : []
      if (!list.length) throw new Error('AI 未返回岗位画像')
      setField(
        'positionProfiles',
        list.map((p: any) => ({
          knowledgeCategory: p.category || '',
          knowledgeAmount: p.description || '',
        })),
      )
      toast.success(`已生成 ${list.length} 条岗位画像，可修改 / 删除 / 新增`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 分析失败')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((j) => setCustomers(j.data || []))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/requirements')
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
      customerId: r.customerId ?? '',
      headcount: r.headcount ?? '',
      monthlySalaryMin: r.monthlySalaryMin ?? '',
      monthlySalaryMax: r.monthlySalaryMax ?? '',
      annualSalaryMin: r.annualSalaryMin ?? '',
      annualSalaryMax: r.annualSalaryMax ?? '',
      ageMin: r.ageMin ?? '',
      ageMax: r.ageMax ?? '',
      genderRequirement: r.genderRequirement ?? '',
      deadline: fmtDate(r.deadline),
      followDate: fmtDate(r.followDate),
      positionProfiles: (r.positionProfiles ?? []).map((x: any) => ({
        knowledgeCategory: x.knowledgeCategory ?? '',
        knowledgeAmount: x.knowledgeAmount ?? '',
      })),
      urgentRecords: (r.urgentRecords ?? []).map((x: any) => ({
        memberId: x.memberId ?? '',
        date: fmtDate(x.date),
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/requirements/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId || String(form.customerId).trim() === '') return toast.error('请填写关联客户 ID')
    if (!form.positionName?.trim()) return toast.error('请填写岗位名称')
    if (form.headcount === '' || form.headcount === null) return toast.error('请填写需求人数')
    if (!form.status?.trim()) return toast.error('请选择状态')
    if (!form.deadline) return toast.error('请选择截止日期')
    if (!form.baseCity?.trim()) return toast.error('请填写 Base 城市')
    setSubmitting(true)
    try {
      const url = editing ? `/api/requirements/${editing.id}` : '/api/requirements'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
    { key: 'customerName', title: '客户简称', accessor: (r) => r.customer?.shortName,
      render: (v) => v ? <span className="font-medium text-primary">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'positionName', title: '岗位名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'headcount', title: '需求人数' },
    { key: 'status', title: '状态',
      render: (v) => <span className={`badge ${STATUS_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{v}</span> },
    { key: 'baseCity', title: 'Base 城市' },
    { key: 'deadline', title: '招聘重启日期', render: (v) => fmtDate(v) || '—' },
    { key: 'recruiter', title: '招聘需求方', render: (v) => v || <span className="text-base-content/30">—</span> },
    { key: 'createdAt', title: '创建时间', render: (v) => <span className="text-base-content/60">{fmtDateTime(v)}</span> },
    // 以下默认隐藏，可在“显示列”开启
    { key: 'customerId', title: '客户 ID', defaultVisible: false },
    { key: 'monthlySalaryMin', title: '月薪下限', defaultVisible: false, render: (v) => num(v) },
    { key: 'monthlySalaryMax', title: '月薪上限', defaultVisible: false, render: (v) => num(v) },
    { key: 'annualSalaryMin', title: '年薪下限', defaultVisible: false, render: (v) => num(v) },
    { key: 'annualSalaryMax', title: '年薪上限', defaultVisible: false, render: (v) => num(v) },
    { key: 'ageMin', title: '年龄下限', defaultVisible: false, render: (v) => num(v) },
    { key: 'ageMax', title: '年龄上限', defaultVisible: false, render: (v) => num(v) },
    { key: 'genderRequirement', title: '性别要求', defaultVisible: false, accessor: (r) => GENDER_LABELS[r.genderRequirement] ?? '' },
    { key: 'educationRequirement', title: '学历要求', defaultVisible: false },
    { key: 'languageRequirement', title: '语言要求', defaultVisible: false },
    { key: 'industry', title: '所属行业', defaultVisible: false },
    { key: 'followDate', title: '登记日期', defaultVisible: false, render: (v) => fmtDate(v) || '—' },
    { key: 'jobDescription', title: '岗位 JD', defaultVisible: false },
    { key: 'closeReason', title: '关闭/暂停原因', defaultVisible: false },
    { key: 'latestUpdate', title: '最新动态', defaultVisible: false },
    { key: 'notes', title: '其他备注', defaultVisible: false },
    { key: 'talentProfile', title: '人才画像', defaultVisible: false },
    { key: 'projectExperience', title: '项目经验', defaultVisible: false },
    { key: 'updatedAt', title: '更新时间', defaultVisible: false, render: (v) => fmtDateTime(v) },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">客户需求管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理客户招聘需求、岗位画像与急聘记录</p>
      </div>

      <BoostTable
        title="需求列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        onImport={can(RES, 'IMPORT') ? () => toast.info('导入功能开发中') : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索岗位 / 客户 / 状态 / 城市…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该需求？" onConfirm={() => handleDelete(r.id)}>
                <button className="btn btn-ghost btn-xs gap-1 text-error">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      {/* ── 新建 / 编辑 ── */}
      <Modal
        open={open}
        title={editing ? '编辑需求' : '新增需求'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={780}
      >
        <div className="grid grid-cols-2 gap-4">
          {/* 客户名称 / 招聘需求方 */}
          <Field label="客户名称" required>
            <select className="select select-bordered w-full" value={form.customerId} onChange={(e) => setField('customerId', e.target.value)}>
              <option value="" disabled hidden>与我司签署服务合同的客户</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
            </select>
          </Field>
          <Field label="招聘需求方">
            <input className="input input-bordered w-full" value={form.recruiter} onChange={(e) => setField('recruiter', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 岗位名称 / 需求人数 */}
          <Field label="岗位名称" required>
            <input className="input input-bordered w-full" value={form.positionName} onChange={(e) => setField('positionName', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="需求人数" required>
            <input type="number" className="input input-bordered w-full" value={form.headcount} onChange={(e) => setField('headcount', e.target.value)} placeholder="请输入数字" />
          </Field>
          {/* 月薪范围 / 年薪范围(万) */}
          <Field label="月薪范围（元）">
            <div className="flex items-center gap-2">
              <input type="number" className="input input-bordered w-full" value={form.monthlySalaryMin} onChange={(e) => setField('monthlySalaryMin', e.target.value)} placeholder="最低" />
              <span className="text-base-content/40">-</span>
              <input type="number" className="input input-bordered w-full" value={form.monthlySalaryMax} onChange={(e) => setField('monthlySalaryMax', e.target.value)} placeholder="最高" />
            </div>
          </Field>
          <Field label="年薪范围（万）">
            <div className="flex items-center gap-2">
              <input type="number" className="input input-bordered w-full" value={form.annualSalaryMin} onChange={(e) => setField('annualSalaryMin', e.target.value)} placeholder="最低" />
              <span className="text-base-content/40">-</span>
              <input type="number" className="input input-bordered w-full" value={form.annualSalaryMax} onChange={(e) => setField('annualSalaryMax', e.target.value)} placeholder="最高" />
            </div>
          </Field>
          {/* 年龄范围 / 性别要求 */}
          <Field label="年龄范围">
            <div className="flex items-center gap-2">
              <input type="number" className="input input-bordered w-full" value={form.ageMin} onChange={(e) => setField('ageMin', e.target.value)} placeholder="最小" />
              <span className="text-base-content/40">-</span>
              <input type="number" className="input input-bordered w-full" value={form.ageMax} onChange={(e) => setField('ageMax', e.target.value)} placeholder="最大" />
            </div>
          </Field>
          <Field label="性别要求">
            <select className="select select-bordered w-full" value={form.genderRequirement} onChange={(e) => setField('genderRequirement', e.target.value)}>
              <option value="" disabled hidden>请选择</option>
              {opts(GENDER_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {/* 学历要求 / 语言要求 */}
          <Field label="学历要求">
            <input className="input input-bordered w-full" value={form.educationRequirement} onChange={(e) => setField('educationRequirement', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="语言要求">
            <input className="input input-bordered w-full" value={form.languageRequirement} onChange={(e) => setField('languageRequirement', e.target.value)} placeholder="非中文" />
          </Field>
          {/* 岗位状态 / 招聘重启日期 */}
          <Field label="岗位状态" required>
            <select className="select select-bordered w-full" value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="" disabled hidden>请选择状态</option>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="招聘重启日期" required>
            <input type="date" className="input input-bordered w-full" value={form.deadline} onChange={(e) => setField('deadline', e.target.value)} />
          </Field>
          {/* Base城市 / 岗位JD */}
          <Field label="Base 城市" required>
            <input className="input input-bordered w-full" value={form.baseCity} onChange={(e) => setField('baseCity', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="岗位 JD">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.jobDescription} onChange={(e) => setField('jobDescription', e.target.value)} placeholder="请输入" />
            <button
              type="button"
              className="btn btn-primary btn-sm mt-1 w-fit gap-1"
              disabled={aiLoading}
              onClick={handleAnalyzeJobProfile}
            >
              {aiLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  分析中…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 分析岗位画像
                </>
              )}
            </button>
          </Field>
          {/* 人才简易画像 / 项目经验 */}
          <Field label="人才简易画像" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.talentProfile} onChange={(e) => setField('talentProfile', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="项目经验" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.projectExperience} onChange={(e) => setField('projectExperience', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 最新动态（人才画像为 AI 生成，存于下方知识技能区，故此处不重复输入） */}
          <Field label="最新动态">
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.latestUpdate} onChange={(e) => setField('latestUpdate', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 附件 / 关闭、暂停原因 */}
          <Field label="附件">
            <FileUpload value={form.attachmentUrl} onChange={(url) => setField('attachmentUrl', url)} />
          </Field>
          <Field label="关闭/暂停原因" required>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={form.closeReason} onChange={(e) => setField('closeReason', e.target.value)} placeholder="请输入" />
          </Field>
          {/* 其他备注 */}
          <Field label="其他备注" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="请输入" />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 子表 */}
        <div className="space-y-4">
          <SubTable
            title="岗位画像"
            value={form.positionProfiles}
            onChange={(rows) => setField('positionProfiles', rows)}
            columns={[
              { key: 'knowledgeCategory', title: '知识分类', type: 'text', width: 180 },
              { key: 'knowledgeAmount', title: '知识解释', type: 'textarea', width: 460 },
            ]}
          />
          <SubTable
            title="急岗管理记录"
            value={form.urgentRecords}
            onChange={(rows) => setField('urgentRecords', rows)}
            columns={[
              { key: 'memberId', title: '成员 ID', type: 'number', width: 160 },
              { key: 'date', title: '日期', type: 'date', width: 160 },
            ]}
          />
        </div>

        <div className="divider my-3" />

        {/* 所属行业 / 登记日期 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="所属行业">
            <input className="input input-bordered w-full" value={form.industry} onChange={(e) => setField('industry', e.target.value)} placeholder="请选择" />
          </Field>
          <Field label="登记日期">
            <input type="date" className="input input-bordered w-full" value={form.followDate} onChange={(e) => setField('followDate', e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
