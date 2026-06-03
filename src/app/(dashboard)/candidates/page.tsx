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
  YearSelect,
  yearOptions,
  SearchSelect,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { useDict } from '@/lib/useDict'
import { refGet } from '@/lib/refCache'

const RES = 'CANDIDATE'

// ─── 枚举映射 ──────────────────────────────────────────────────────────────────
const EDUCATION_LABELS: Record<string, string> = {
  BACHELOR: '本科',
  MASTER: '硕士',
  DOCTOR: '博士',
  ASSOCIATE: '大专',
  OTHER: '其他',
}
const SCHOOL_TIER_LABELS: Record<string, string> = {
  T985_211: '985/211',
  GENERAL_FIRST: '双一流',
  GENERAL: '普通',
  OVERSEAS: '海外留学',
}
const STATUS_LABELS: Record<string, string> = {
  PENDING: '已推荐，待反馈',
  INTERVIEWING: '面试中',
  SALARY_NEGO: '谈薪中',
  OFFERING: 'Offer中',
  ONBOARDING: '入职中',
  GUARANTEE: '保证期',
  POST_GUARANTEE_CLOSED: '过保关闭',
  RESUME_FAILED: '简历失败',
  INTERNAL_RESUME_FAILED: '简历(内推)失败',
  INTERVIEW_SCHEDULE_FAILED: '约面失败',
  INTERVIEW_FAILED: '面试失败',
  SALARY_NEGO_FAILED: '谈薪失败',
  OFFER_FAILED: 'offer失败',
  ONBOARD_FAILED: '入职失败',
  NOT_PASSED_GUARANTEE: '未过保',
  RESIGNED_POST_GUARANTEE: '简历挂起（已面）',
  RESIGNED_LOCAL: '简历挂起（未面）',
}
const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-info',
  INTERVIEWING: 'badge-info',
  SALARY_NEGO: 'badge-warning',
  OFFERING: 'badge-warning',
  ONBOARDING: 'badge-primary',
  GUARANTEE: 'badge-success',
  POST_GUARANTEE_CLOSED: 'badge-ghost',
  RESUME_FAILED: 'badge-error',
  INTERNAL_RESUME_FAILED: 'badge-error',
  INTERVIEW_SCHEDULE_FAILED: 'badge-error',
  INTERVIEW_FAILED: 'badge-error',
  SALARY_NEGO_FAILED: 'badge-error',
  OFFER_FAILED: 'badge-error',
  ONBOARD_FAILED: 'badge-error',
  NOT_PASSED_GUARANTEE: 'badge-warning',
  RESIGNED_POST_GUARANTEE: 'badge-ghost',
  RESIGNED_LOCAL: 'badge-ghost',
}

// 推荐状态 → 该状态下额外显示的组件（严格对照客户给的「状态 → 显示组件」对照表）。
// 'guaranteeCommunications' 是子表（保证期内沟通记录），仅 保证期/过保关闭 显示；其余均为流程字段。
const STATUS_FIELDS: Record<string, string[]> = {
  PENDING: [],
  INTERVIEWING: ['interviewProgress'],
  SALARY_NEGO: ['interviewProgress', 'salaryPlan'],
  OFFERING: ['interviewProgress', 'backgroundCheckReportUrl', 'salaryPlan'],
  ONBOARDING: ['interviewProgress', 'offerDate', 'offerOnboardDate', 'offerFileUrl', 'salaryPlan'],
  GUARANTEE: ['interviewProgress', 'offerDate', 'offerOnboardDate', 'offerFileUrl', 'actualOnboardDate', 'guaranteePeriodEnd', 'salaryPlan', 'guaranteeCommunications', 'guaranteePeriodMonths'],
  POST_GUARANTEE_CLOSED: ['interviewProgress', 'offerDate', 'offerOnboardDate', 'actualOnboardDate', 'guaranteePeriodEnd', 'guaranteeCommunications'],
  RESUME_FAILED: ['failureReason'],
  INTERNAL_RESUME_FAILED: ['failureReason'],
  INTERVIEW_SCHEDULE_FAILED: ['interviewProgress', 'failureReason'],
  INTERVIEW_FAILED: ['interviewProgress', 'failureReason'],
  SALARY_NEGO_FAILED: ['interviewProgress', 'failureReason'],
  OFFER_FAILED: ['interviewProgress', 'failureReason'],
  ONBOARD_FAILED: ['interviewProgress', 'failureReason'],
  NOT_PASSED_GUARANTEE: ['interviewProgress', 'failureReason', 'offerDate', 'offerOnboardDate', 'offerFileUrl', 'backgroundCheckReportUrl', 'actualOnboardDate', 'salaryPlan', 'guaranteePeriodMonths'],
  RESIGNED_POST_GUARANTEE: ['interviewProgress', 'failureReason'],
  RESIGNED_LOCAL: ['failureReason'],
}

// 所有受状态驱动的流程字段全集（提交前用于清除当前状态不显示的字段，避免脏数据）
const ALL_FLOW_FIELDS = Array.from(new Set(Object.values(STATUS_FIELDS).flat()))

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }))
const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '')
const fmtDateTime = (s?: string | null) => (s ? String(s).slice(0, 16) : '')

// 岗位"不再招聘"的状态：候选人选岗位时，岗位若仅含这些状态则不可选；
// 只要还有任一其它（在招）状态即可选（OR 关系，配合需求侧多选状态）。
const REQUIREMENT_CLOSED_STATUSES = ['关闭', '暂停']
const isRecruitingReq = (r: any): boolean => {
  const st = Array.isArray(r.status) ? r.status : r.status ? [r.status] : []
  return st.length === 0 || st.some((s: string) => !REQUIREMENT_CLOSED_STATUSES.includes(s))
}

const EMPTY_FORM: any = {
  name: '', birthYear: '', phone: '', email: '',
  education: '', schoolTier: '', customerId: '', customerShortName: '', requirementId: '',
  recruitmentParty: '', recruitmentChannel: '', recommendationTime: '',
  recommendationStatus: 'PENDING',
  recommendationReportUrl: '', recommendationReason: '', interviewProgress: '',
  failureReason: '', offerDate: '', offerOnboardDate: '', offerFileUrl: '',
  backgroundCheckReportUrl: '', actualOnboardDate: '', salaryPlan: '',
  guaranteePeriodEnd: '', guaranteePeriodMonths: '',
  tags: '', notes: '', submitDepartmentId: '', submitterId: '',
  guaranteeCommunications: [], riskEvents: [],
}

export default function CandidatesPage() {
  const toast = useToast()
  const { can, isOwner, userId, departmentId } = useMyPermissions()
  const { items: channelOptions } = useDict('recruitment_channel')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [customers, setCustomers] = useState<any[]>([])
  const [requirements, setRequirements] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])

  // 表单引用数据按需加载：打开新增/编辑弹窗时再拉（refGet 按 url 缓存 60s + 在途去重，已缓存则瞬时）
  const loadFormRefs = useCallback(async () => {
    const [c, r, d, u] = await Promise.all([
      refGet('/api/clients/options'),
      refGet('/api/requirements/options'),
      refGet('/api/departments'),
      refGet('/api/users'),
    ])
    setCustomers(c)
    setRequirements(r)
    setDepartments(d)
    setUsers(u)
  }, [])

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const visible = (field: string) =>
    (STATUS_FIELDS[form.recommendationStatus] ?? []).includes(field)

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/candidates')
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
    void loadFormRefs()
    setEditing(null)
    // 提交人 / 提交人部门默认填当前登录用户（仍可在下拉中改）
    setForm({
      ...EMPTY_FORM,
      submitterId: userId != null ? String(userId) : '',
      submitDepartmentId: departmentId != null ? String(departmentId) : '',
    })
    setOpen(true)
  }

  const openEdit = (r: any) => {
    void loadFormRefs()
    setEditing(r)
    setForm({
      ...EMPTY_FORM,
      ...r,
      birthYear: r.birthYear ?? '',
      customerId: r.customerId ?? '',
      customerShortName: r.customerShortName ?? '',
      requirementId: r.requirementId ?? '',
      submitDepartmentId: r.submitDepartmentId ?? '',
      submitterId: r.submitterId ?? '',
      guaranteePeriodMonths: r.guaranteePeriodMonths ?? '',
      recommendationTime: fmtDateTime(r.recommendationTime),
      offerDate: fmtDate(r.offerDate),
      offerOnboardDate: fmtDate(r.offerOnboardDate),
      actualOnboardDate: fmtDate(r.actualOnboardDate),
      guaranteePeriodEnd: fmtDate(r.guaranteePeriodEnd),
      tags: Array.isArray(r.tags) ? r.tags.join(', ') : '',
      guaranteeCommunications: (r.guaranteeCommunications ?? []).map((x: any) => ({
        date: fmtDate(x.date),
        content: x.content ?? '',
      })),
      riskEvents: (r.riskEvents ?? []).map((x: any) => ({
        date: fmtDate(x.date),
        riskDescription: x.riskDescription ?? '',
      })),
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || "")
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : ('删除失败'))
    }
  }

  const handleSubmit = async () => {
    // 必填校验（顺序与表单一致；Field 的 required 仅画星号，校验在此手动做）
    if (!form.name?.trim()) return toast.error('请填写候选人姓名')
    if (!form.birthYear) return toast.error('请选择出生年份')
    if (!form.phone?.trim()) return toast.error('请填写联系电话')
    if (!form.email?.trim()) return toast.error('请填写候选人邮箱')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast.error('邮箱格式不正确')
    if (!form.education) return toast.error('请选择教育经历')
    if (!form.customerId) return toast.error('请选择客户名称')
    if (!form.customerShortName?.trim()) return toast.error('请填写客户简称')
    if (!form.recruitmentParty?.trim()) return toast.error('请选择招聘需求方')
    if (!form.requirementId) return toast.error('请选择岗位名称')
    if (!form.recommendationTime) return toast.error('请选择推荐时间')
    if (!form.recruitmentChannel?.trim()) return toast.error('请选择招聘渠道')
    if (!form.recommendationReportUrl) return toast.error('请上传推荐报告')
    if (!form.recommendationReason?.trim()) return toast.error('请填写推荐理由')
    setSubmitting(true)
    try {
      const visibleFlow = new Set(STATUS_FIELDS[form.recommendationStatus] ?? [])
      const payload: any = {
        ...form,
        tags: String(form.tags || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }
      // 清除当前推荐状态下不显示的流程字段，避免与最终状态矛盾的脏数据入库
      // 子表（guaranteeCommunications）是数组，隐藏时不在此清空（避免误清子表数据），仅清字符串型流程字段
      for (const f of ALL_FLOW_FIELDS) {
        if (f === 'guaranteeCommunications') continue
        if (!visibleFlow.has(f)) payload[f] = ''
      }
      const url = editing ? `/api/candidates/${editing.id}` : '/api/candidates'
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
    { key: 'customerName', title: '客户简称', accessor: (r) => r.customer?.shortName,
      render: (v) => v ? <span className="font-medium text-primary">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'positionName', title: '岗位名称', accessor: (r) => r.requirement?.positionName },
    { key: 'name', title: '候选人姓名', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'recommendationTime', title: '推荐时间', accessor: (r) => r.recommendationTime, filterType: 'date',
      render: (v) => <span className="text-base-content/60">{v ? String(v).slice(0, 16).replace('T', ' ') : '—'}</span> },
    { key: 'recommendationStatus', title: '推荐状态', filterType: 'select', filterOptions: opts(STATUS_LABELS),
      render: (v) => <span className={`badge ${STATUS_BADGE[v] ?? 'badge-ghost'} badge-sm`}>{STATUS_LABELS[v] ?? v}</span> },
    { key: 'submitterName', title: '提交人', accessor: (r) => r.submitter?.name },
    { key: 'interviewProgress', title: '面试进展', render: (v) => v ? <span className="line-clamp-1 max-w-[200px]">{v}</span> : <span className="text-base-content/30">—</span> },
    // 以下默认隐藏，可在"显示列"开启 —— 覆盖全部字段
    { key: 'recruitmentParty', title: '招聘需求方', defaultVisible: false },
    { key: 'recruitmentChannel', title: '招聘渠道', defaultVisible: false, filterType: 'select', filterOptions: channelOptions },
    { key: 'phone', title: '联系电话', defaultVisible: false },
    { key: 'email', title: '邮箱', defaultVisible: false },
    { key: 'birthYear', title: '出生年份', defaultVisible: false, filterType: 'select', filterOptions: yearOptions(1950, 0) },
    { key: 'education', title: '教育经历', defaultVisible: false, accessor: (r) => EDUCATION_LABELS[r.education] ?? '',
      filterType: 'select', filterOptions: Object.values(EDUCATION_LABELS).map((l) => ({ label: l, value: l })) },
    { key: 'schoolTier', title: '院校', defaultVisible: false, accessor: (r) => SCHOOL_TIER_LABELS[r.schoolTier] ?? '',
      filterType: 'select', filterOptions: Object.values(SCHOOL_TIER_LABELS).map((l) => ({ label: l, value: l })) },
    { key: 'recommendationReason', title: '推荐理由', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[200px]">{v}</span> : '—' },
    { key: 'offerDate', title: 'Offer日期', defaultVisible: false, filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'offerOnboardDate', title: 'Offer到岗日期', defaultVisible: false, filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'actualOnboardDate', title: '实际到岗日期', defaultVisible: false, filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'salaryPlan', title: '薪酬方案', defaultVisible: false, render: (v) => v ? <span className="line-clamp-1 max-w-[200px]">{v}</span> : '—' },
    { key: 'guaranteePeriodEnd', title: '保证期结束日期', defaultVisible: false, filterType: 'date', render: (v) => fmtDate(v) || '—' },
    { key: 'guaranteePeriodMonths', title: '保证期时长(月)', defaultVisible: false, filterType: 'number' },
    { key: 'failureReason', title: '推荐失败原因', defaultVisible: false },
    { key: 'tags', title: '候选人标签', defaultVisible: false, sortable: false,
      accessor: (r) => (Array.isArray(r.tags) ? r.tags.join(' ') : ''),
      render: (_v, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.tags ?? []).map((t: string, i: number) => (
            <span key={i} className="badge badge-ghost badge-sm">{t}</span>
          ))}
        </div>
      ) },
    { key: 'notes', title: '备注', defaultVisible: false },
    { key: 'customerShortName', title: '客户简称(填写)', defaultVisible: false },
    { key: 'recommendationReportUrl', title: '推荐报告', defaultVisible: false, render: (v) => (v ? '有' : '—') },
    { key: 'offerFileUrl', title: 'Offer 文件', defaultVisible: false, render: (v) => (v ? '有' : '—') },
    { key: 'backgroundCheckReportUrl', title: '背景调查报告', defaultVisible: false, render: (v) => (v ? '有' : '—') },
    { key: 'guaranteeCommunications', title: '保证期沟通', defaultVisible: false, sortable: false,
      accessor: (r) => (r.guaranteeCommunications ?? []).map((x: any) => x.content).filter(Boolean).join('；'),
      render: (_v, r) => (
        <SubTableCell rows={r.guaranteeCommunications} title="保证期内沟通记录" unit="条"
          columns={[
            { key: 'date', title: '日期', render: (v) => fmtDate(v) },
            { key: 'content', title: '沟通内容' },
          ]} />
      ) },
    { key: 'riskEvents', title: '风险事件', defaultVisible: false, sortable: false,
      accessor: (r) => (r.riskEvents ?? []).map((x: any) => x.riskDescription).filter(Boolean).join('；'),
      render: (_v, r) => (
        <SubTableCell rows={r.riskEvents} title="风险管理表单" unit="条"
          columns={[
            { key: 'date', title: '日期', render: (v) => fmtDate(v) },
            { key: 'riskDescription', title: '风险识别' },
          ]} />
      ) },
    { key: 'customerId', title: '客户 ID', defaultVisible: false },
    { key: 'requirementId', title: '需求 ID', defaultVisible: false },
    { key: 'submitDepartmentId', title: '提交人部门 ID', defaultVisible: false },
    { key: 'submitterId', title: '提交人 ID', defaultVisible: false },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">候选人挖猎进度看板</h1>
        <p className="mt-0.5 text-sm text-base-content/50">管理所有候选人信息及推荐进展</p>
      </div>

      <BoostTable
        title="候选人列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={can(RES, 'CREATE') ? openCreate : undefined}
        createText="新增"
        onImport={can(RES, 'IMPORT') ? () => toast.info('导入功能开发中') : undefined}
        onRefresh={() => fetchData(true)}
        showExport={can(RES, 'EXPORT')}
        searchPlaceholder="搜索姓名 / 客户 / 岗位 / 状态…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            {can(RES, 'EDIT') && isOwner(r) && (
              <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
            {can(RES, 'DELETE') && isOwner(r) && (
              <Popconfirm title="确认删除该候选人？" onConfirm={() => handleDelete(r.id)}>
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
        title={editing ? '编辑候选人' : '新增候选人'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={760}
      >
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="候选人姓名" required>
            <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="出生年份" required>
            <YearSelect value={form.birthYear} onChange={(v) => setField('birthYear', v)} minYear={1950} />
          </Field>
          <Field label="联系电话" required>
            <input className="input input-bordered w-full" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="候选人邮箱" required>
            <input className="input input-bordered w-full" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="请输入" />
          </Field>
          <Field label="教育经历" required>
            <SearchSelect value={form.education} onChange={(v) => setField('education', v)} options={opts(EDUCATION_LABELS)} placeholder="请选择" />
          </Field>
          <Field label="院校">
            <SearchSelect value={form.schoolTier} onChange={(v) => setField('schoolTier', v)} options={opts(SCHOOL_TIER_LABELS)} placeholder="请选择" />
          </Field>
          <Field label="客户名称" required>
            <SearchSelect
              value={String(form.customerId ?? '')}
              placeholder="请选择客户"
              options={customers.map((c) => ({ value: String(c.id), label: c.fullName || c.shortName }))}
              onChange={(v) => {
                setField('customerId', v)
                setField('requirementId', '')
                setField('recruitmentParty', '')
                const c = customers.find((x) => String(x.id) === v)
                setField('customerShortName', c?.shortName || '')
              }}
            />
          </Field>
          <Field label="客户简称" required>
            <input
              className="input input-bordered w-full"
              value={form.customerShortName}
              onChange={(e) => setField('customerShortName', e.target.value)}
              placeholder="选择客户后自动填充，可修改"
            />
          </Field>
          <Field label="招聘需求方" required>
            <SearchSelect
              value={form.recruitmentParty}
              disabled={!form.customerId}
              placeholder={form.customerId ? '请选择招聘需求方' : '请先选择客户'}
              options={[
                ...new Set(
                  requirements
                    .filter((r) => String(r.customerId) === String(form.customerId) && r.recruiter && isRecruitingReq(r))
                    .map((r) => r.recruiter),
                ),
              ].map((rc: any) => ({ value: rc, label: rc }))}
              onChange={(v) => {
                setField('recruitmentParty', v)
                setField('requirementId', '')
              }}
            />
          </Field>
          <Field label="岗位名称" required>
            <SearchSelect
              value={String(form.requirementId ?? '')}
              disabled={!form.customerId}
              placeholder={form.customerId ? '请选择岗位' : '请先选择客户'}
              options={requirements
                .filter(
                  (r) =>
                    String(r.customerId) === String(form.customerId) &&
                    (!form.recruitmentParty || r.recruiter === form.recruitmentParty) &&
                    isRecruitingReq(r),
                )
                .map((r) => ({ value: String(r.id), label: r.positionName }))}
              onChange={(v) => setField('requirementId', v)}
            />
          </Field>
          <Field label="推荐时间" required>
            <input type="datetime-local" className="input input-bordered w-full" value={form.recommendationTime} onChange={(e) => setField('recommendationTime', e.target.value)} />
          </Field>
          <Field label="招聘渠道" required>
            <SearchSelect value={form.recruitmentChannel} onChange={(v) => setField('recruitmentChannel', v)} options={channelOptions} placeholder="请选择" />
          </Field>
          <Field label="推荐报告" required>
            <FileUpload value={form.recommendationReportUrl} onChange={(url) => setField('recommendationReportUrl', url)} />
          </Field>
          <Field label="推荐状态" required>
            <SearchSelect value={form.recommendationStatus} onChange={(v) => setField('recommendationStatus', v)} options={opts(STATUS_LABELS)} placeholder="请选择" />
          </Field>
          <Field label="推荐理由" required className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.recommendationReason} onChange={(e) => setField('recommendationReason', e.target.value)} placeholder="请填写推荐理由" />
          </Field>
        </div>

        <div className="divider my-3" />

        {/* 状态驱动流程字段 */}
        <div className="rounded-xl border border-base-300 bg-base-200/40 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            流程字段（根据推荐状态显示）
          </div>
          <div className="grid grid-cols-2 gap-4">
            {visible('interviewProgress') && (
              <Field label="面试进展" className="col-span-2">
                <textarea className="textarea textarea-bordered w-full" rows={2} value={form.interviewProgress} onChange={(e) => setField('interviewProgress', e.target.value)} placeholder="描述当前面试进展" />
              </Field>
            )}
            {visible('salaryPlan') && (
              <Field label="薪酬方案" className="col-span-2">
                <textarea className="textarea textarea-bordered w-full" rows={2} value={form.salaryPlan} onChange={(e) => setField('salaryPlan', e.target.value)} placeholder="薪资结构、年终、股票等" />
              </Field>
            )}
            {visible('offerDate') && (
              <Field label="Offer 日期">
                <input type="date" className="input input-bordered w-full" value={form.offerDate} onChange={(e) => setField('offerDate', e.target.value)} />
              </Field>
            )}
            {visible('offerOnboardDate') && (
              <Field label="Offer 到岗日期">
                <input type="date" className="input input-bordered w-full" value={form.offerOnboardDate} onChange={(e) => setField('offerOnboardDate', e.target.value)} />
              </Field>
            )}
            {visible('offerFileUrl') && (
              <Field label="Offer（上传文件）" className="col-span-2">
                <FileUpload value={form.offerFileUrl} onChange={(url) => setField('offerFileUrl', url)} />
              </Field>
            )}
            {visible('backgroundCheckReportUrl') && (
              <Field label="背景调查报告" className="col-span-2">
                <FileUpload value={form.backgroundCheckReportUrl} onChange={(url) => setField('backgroundCheckReportUrl', url)} />
              </Field>
            )}
            {visible('actualOnboardDate') && (
              <Field label="实际到岗日期">
                <input type="date" className="input input-bordered w-full" value={form.actualOnboardDate} onChange={(e) => setField('actualOnboardDate', e.target.value)} />
              </Field>
            )}
            {visible('guaranteePeriodEnd') && (
              <Field label="保证期结束日期">
                <input type="date" className="input input-bordered w-full" value={form.guaranteePeriodEnd} onChange={(e) => setField('guaranteePeriodEnd', e.target.value)} />
              </Field>
            )}
            {visible('guaranteePeriodMonths') && (
              <Field label="保证期时长(月)">
                <input type="number" className="input input-bordered w-full" value={form.guaranteePeriodMonths} onChange={(e) => setField('guaranteePeriodMonths', e.target.value)} placeholder="请输入数字" />
              </Field>
            )}
            {visible('failureReason') && (
              <Field label="推荐失败原因描述" className="col-span-2">
                <textarea className="textarea textarea-bordered w-full" rows={2} value={form.failureReason} onChange={(e) => setField('failureReason', e.target.value)} placeholder="请填写失败的具体原因，如谈薪失败的实际谈薪、期望薪资、gap 等" />
              </Field>
            )}
          </div>
        </div>

        <div className="divider my-3" />

        {/* 子表 */}
        <div className="space-y-4">
          {visible('guaranteeCommunications') && (
            <SubTable
              title="保证期内沟通记录"
              value={form.guaranteeCommunications}
              onChange={(rows) => setField('guaranteeCommunications', rows)}
              columns={[
                { key: 'date', title: '日期', type: 'date', width: 160 },
                { key: 'content', title: '沟通内容', type: 'textarea', width: 320 },
              ]}
            />
          )}
          <SubTable
            title="风险管理表单"
            value={form.riskEvents}
            onChange={(rows) => setField('riskEvents', rows)}
            columns={[
              { key: 'date', title: '日期', type: 'date', width: 160 },
              { key: 'riskDescription', title: '风险识别', type: 'textarea', width: 320 },
            ]}
          />
        </div>

        <div className="divider my-3" />

        {/* 底部 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="候选人标签（逗号分隔）" className="col-span-2">
            <input className="input input-bordered w-full" value={form.tags} onChange={(e) => setField('tags', e.target.value)} placeholder="如：核心人才, 已背调" />
          </Field>
          <Field label="提交人部门">
            <SearchSelect
              value={String(form.submitDepartmentId ?? '')}
              placeholder="请选择部门"
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
              onChange={(v) => setForm((f: any) => ({ ...f, submitDepartmentId: v, submitterId: '' }))}
            />
          </Field>
          <Field label="提交人">
            <SearchSelect
              value={String(form.submitterId ?? '')}
              placeholder="请选择提交人"
              options={users
                .filter((u) => !form.submitDepartmentId || String(u.departmentId ?? '') === String(form.submitDepartmentId))
                .map((u) => ({ value: String(u.id), label: u.name }))}
              onChange={(v) => {
                const u = users.find((x) => String(x.id) === v)
                setForm((f: any) => ({
                  ...f,
                  submitterId: v,
                  submitDepartmentId: u?.departmentId != null ? String(u.departmentId) : f.submitDepartmentId,
                }))
              }}
            />
          </Field>
          <Field label="备注" className="col-span-2">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="其他备注信息" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
