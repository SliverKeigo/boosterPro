/* eslint-disable @typescript-eslint/no-explicit-any */
// 四模块的简道云封存包列映射（客户/需求/候选人/知识库）。**按第 1 行表头列名定位**（不依赖列序：
// 列挪位 / 中间多出无关列都不影响，未知列忽略）。值转换/枚举口径与一次性迁移脚本 etl-fresh.py 一致。
// 子表：第 1 行横向合并的组 + 第 2 行字段名（引擎按合并区间圈定），客户办公地址为单列多值。
import { prisma } from '@/lib/prisma'
import type { ResourceKey } from '@/lib/resources'
import type { JodooModule, JodooCtx } from '@/lib/jodooImport'

// ── 值转换工具 ────────────────────────────────────────────────────────────────
const stripFinst = (s: string) => String(s ?? '').replace(/\s*\[FINST-[^\]]*\]/g, '').trim()
const arr = (s: string) => String(s).split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean)
const industryFirst = (s: string) => String(s).split(/[,，]/)[0].trim() || undefined
const intVal = (s: string) => { const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return Number.isNaN(n) ? undefined : n }
const yearVal = (s: string) => { const m = String(s).match(/\d{4}/); return m ? parseInt(m[0], 10) : undefined }
const dateVal = (s: string): Date | undefined => {
  const t = String(s).trim().replace(/\//g, '-')
  if (!t) return undefined
  const iso = t.includes(' ') || t.includes('T') ? t.replace(' ', 'T') + '+08:00' : t.slice(0, 10) + 'T00:00:00+08:00'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}
const addrSplit = (raw: string): [string, string] => {
  const p = String(raw ?? '').split(/[/／]/).map((x) => x.trim()).filter(Boolean)
  if (!p.length) return ['其他', '—']
  const region = p.slice(0, 3).join('/')
  const detail = p.length > 3 ? p.slice(3).join('/') : p[p.length - 1] || region
  return [region, detail]
}

// ── 枚举：简道云中文 → schema 枚举 key。未命中 undefined → 该行报错 ──
const mapEnum = (m: Record<string, string>) => (raw: string) => m[String(raw).trim()]
const GENDER = mapEnum({ 男: 'MALE', 女: 'FEMALE', 不限: 'ANY' })
const EDU = mapEnum({ 本科: 'BACHELOR', 硕士: 'MASTER', 博士: 'DOCTOR', 大专: 'ASSOCIATE', 其他: 'OTHER' })
const TIER_MAP: Record<string, string> = { '985/211': 'T985_211', 双一流: 'GENERAL_FIRST', 普通: 'GENERAL', 海外留学: 'OVERSEAS' }
const tierArr = (raw: string): string[] =>
  String(raw).split(/[,，、]/).map((x) => x.trim()).filter(Boolean).map((p) => TIER_MAP[p]).filter(Boolean) as string[]
const RSTATUS: Record<string, string> = {
  简历失败: 'RESUME_FAILED', '简历(内推)失败': 'INTERNAL_RESUME_FAILED', 约面失败: 'INTERVIEW_SCHEDULE_FAILED',
  面试失败: 'INTERVIEW_FAILED', 谈薪失败: 'SALARY_NEGO_FAILED', offer失败: 'OFFER_FAILED', 入职失败: 'ONBOARD_FAILED',
  未过保: 'NOT_PASSED_GUARANTEE', '简历挂起（已面）': 'RESIGNED_POST_GUARANTEE', '简历挂起（未面）': 'RESIGNED_LOCAL',
  '已推荐，待反馈': 'PENDING', 面试中: 'INTERVIEWING', 谈薪中: 'SALARY_NEGO', Offer中: 'OFFERING',
  入职中: 'ONBOARDING', 保证期: 'GUARANTEE', 过保关闭: 'POST_GUARANTEE_CLOSED',
}

async function findCustomerId(name: string): Promise<number | null> {
  if (!name) return null
  const c = await prisma.customer.findFirst({ where: { OR: [{ fullName: name }, { shortName: name }] }, select: { id: true } })
  return c?.id ?? null
}
const subDate = (s: string): Date | null => dateVal(s) ?? null

// ── 四模块配置 ────────────────────────────────────────────────────────────────
const CUSTOMER: JodooModule = {
  model: 'customer',
  label: '客户基本信息',
  signature: ['客户名称', '客户简称', '提交人'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  fields: [
    { header: '客户名称', field: 'fullName', required: true },
    { header: '客户简称', field: 'shortName' },
    { header: '所属行业', field: 'industry', transform: industryFirst },
    { header: '对标企业', field: 'benchmarkCompanies' },
    { header: '开聊话术', field: 'openingSpeech' },
    { header: '客户曾用名', field: 'formerName' },
  ],
  attachments: [{ header: '客户附件资料', field: 'attachmentUrl' }],
  // 「定位」列暂不导：简道云定位组件经纬度顺序未知、且本批数据为空，待样例确认后再补 locationLat/Lng。
  splitSubtables: [{
    header: '多个办公地址', relationField: 'officeAddresses', field: 'address',
    jsonHeader: '办公地址JSON', fromJson: async (o: any) => (o?.address ? { address: o.address } : null),
  }],
  resolveScalars: async (get, scalars) => {
    const [region, detail] = addrSplit(get('公司地址'))
    scalars.region = region
    scalars.detailedAddress = detail
    if (!scalars.shortName) scalars.shortName = String(scalars.fullName ?? '').slice(0, 20)
  },
  dedupe: (s) => ({ fullName: s.fullName }),
}

const REQUIREMENT: JodooModule = {
  model: 'requirement',
  label: '客户需求管理',
  signature: ['岗位名称', '岗位状态', '客户名称'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  fields: [
    { header: '招聘需求方', field: 'recruiter', transform: stripFinst },
    { header: '岗位名称', field: 'positionName', required: true },
    { header: '岗位状态', field: 'status', transform: arr },
    { header: '月薪范围', field: 'monthlySalary' },
    { header: 'Base城市', field: 'baseCity' },
    { header: '最新动态', field: 'latestUpdate' },
    { header: '需求人数', field: 'headcount', transform: intVal },
    { header: '年薪范围(万)', field: 'annualSalary' },
    { header: '年龄范围', field: 'ageRange' },
    { header: '性别要求', field: 'genderRequirement', transform: GENDER },
    { header: '岗位JD', field: 'jobDescription' },
    { header: '人才简易画像', field: 'talentProfile' },
    { header: '其他备注', field: 'notes' },
    { header: '所属行业', field: 'industry', transform: industryFirst },
    { header: '项目经验', field: 'projectExperience' },
    { header: '关闭/暂停原因', field: 'closeReason' },
    { header: '学历要求', field: 'educationRequirement' },
    { header: '语言要求', field: 'languageRequirement' },
    { header: '招聘重启日期', field: 'deadline', transform: dateVal },
  ],
  attachments: [{ header: '附件', field: 'attachmentUrl' }],
  groupKeyHeaders: ['客户名称', '岗位名称'],
  subtables: [
    {
      relationField: 'positionProfiles', match: '知识分类',
      build: async (g) => {
        const cat = g('知识分类').trim(), amt = g('知识解读').trim()
        if (!cat && !amt) return null
        return { knowledgeCategory: cat || null, knowledgeAmount: amt || null }
      },
      jsonHeader: '岗位画像JSON',
      fromJson: async (o: any) => {
        if (!o?.knowledgeCategory && !o?.knowledgeAmount) return null
        return { knowledgeCategory: o.knowledgeCategory || null, knowledgeAmount: o.knowledgeAmount || null }
      },
    },
    {
      relationField: 'urgentRecords', match: '成员',
      build: async (g, ctx: JodooCtx) => {
        const mem = g('成员').trim(), dt = g('日期').trim()
        if (!mem && !dt) return null
        return { memberId: mem ? await ctx.ensureUser(mem) : null, date: subDate(dt) }
      },
      jsonHeader: '加急记录JSON',
      fromJson: async (o: any, ctx: JodooCtx) => {
        if (!o?.memberName && !o?.date) return null
        return { memberId: o.memberName ? await ctx.ensureUser(o.memberName) : null, date: subDate(o.date) }
      },
    },
  ],
  resolveScalars: async (get, scalars) => {
    const cn = stripFinst(get('客户名称'))
    if (!cn) throw new Error('缺少「客户名称」')
    const cid = await findCustomerId(cn)
    if (cid == null) throw new Error(`找不到客户「${cn}」，请先导入客户基本信息`)
    scalars.customerId = cid
    if (scalars.headcount == null) scalars.headcount = 1
    if (!scalars.baseCity) scalars.baseCity = '—'
  },
  dedupe: (s) => ({ customerId: s.customerId, positionName: s.positionName }),
}

const CANDIDATE: JodooModule = {
  model: 'candidate',
  label: '候选人管理',
  signature: ['候选人姓名', '推荐状态', '客户简称'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  fields: [
    { header: '客户简称', field: 'customerShortName', transform: stripFinst },
    { header: '候选人姓名', field: 'name', required: true },
    { header: '推荐时间', field: 'recommendationTime', transform: dateVal },
    { header: '推荐状态', field: 'recommendationStatus', transform: (r) => RSTATUS[String(r).trim()] ?? 'PENDING' },
    { header: '面试进展', field: 'interviewProgress' },
    { header: '教育经历', field: 'education', transform: EDU },
    { header: '候选人联系电话', field: 'phone' },
    { header: '候选人标签', field: 'tags', transform: arr },
    { header: '院校', field: 'schoolTier', transform: tierArr },
    { header: '保证期结束日期', field: 'guaranteePeriodEnd', transform: dateVal },
    { header: '招聘需求方', field: 'recruitmentParty', transform: stripFinst },
    { header: '候选人邮箱', field: 'email' },
    { header: '备注', field: 'notes' },
    { header: '出生年份', field: 'birthYear', transform: yearVal },
    { header: '薪酬方案', field: 'salaryPlan' },
    { header: '推荐理由', field: 'recommendationReason' },
    { header: '推荐失败原因描述', field: 'failureReason' },
  ],
  attachments: [
    { header: 'Offer', field: 'offerFileUrl' },
    { header: '背景调查报告', field: 'backgroundCheckReportUrl' },
  ],
  groupKeyHeaders: ['候选人姓名', '客户简称', '岗位名称'],
  subtables: [
    {
      relationField: 'guaranteeCommunications', match: '沟通内容',
      build: async (g) => {
        const dt = g('日期').trim(), ct = g('沟通内容').trim()
        if (!dt && !ct) return null
        return { date: subDate(dt), content: ct || null }
      },
      jsonHeader: '保证期沟通JSON',
      fromJson: async (o: any) => {
        if (!o?.date && !o?.content) return null
        return { date: subDate(o.date), content: o.content || null }
      },
    },
    {
      relationField: 'riskEvents', match: '风险识别',
      build: async (g) => {
        const id = g('风险识别').trim(), mc = g('风险管控/应对').trim(), dt = g('日期').trim()
        const desc = [id, mc].filter(Boolean).join(' / ')
        if (!desc && !dt) return null
        return { date: subDate(dt), riskDescription: desc || null }
      },
      jsonHeader: '风险事件JSON',
      fromJson: async (o: any) => {
        if (!o?.date && !o?.riskDescription) return null
        return { date: subDate(o.date), riskDescription: o.riskDescription || null }
      },
    },
  ],
  resolveScalars: async (get, scalars) => {
    const short = scalars.customerShortName as string | undefined
    const cid = short ? await findCustomerId(short) : null
    if (cid != null) scalars.customerId = cid
    const pos = stripFinst(get('岗位名称'))
    if (cid != null && pos) {
      const r = await prisma.requirement.findFirst({ where: { customerId: cid, positionName: pos }, select: { id: true } })
      if (r) scalars.requirementId = r.id
    }
    scalars.recruitmentChannel = '其他'
    if (!scalars.recommendationStatus) scalars.recommendationStatus = 'PENDING'
  },
  dedupe: (s) => ({ name: s.name, customerShortName: s.customerShortName ?? null, requirementId: s.requirementId ?? null }),
}

const KNOWLEDGE: JodooModule = {
  model: 'knowledgeBase',
  label: '公司知识库',
  signature: ['关键词', '知识分类', '提交人'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  fields: [
    { header: '关键词', field: 'keywords', required: true },
    { header: '知识分类', field: 'category' },
    { header: '知识标签', field: 'tags', transform: arr },
    { header: '外部讲师', field: 'externalLecturer' },
    { header: '培训提纲', field: 'trainingOutline' },
  ],
  attachments: [{ header: '知识文件', field: 'fileUrl' }],
  userFields: [{ header: '内部讲师', field: 'internalLecturerId' }],
  groupKeyHeaders: ['关键词', '创建时间'],
  subtables: [
    {
      relationField: 'managementRecords', match: '管理明细',
      build: async (g, ctx: JodooCtx) => {
        const sub = g('提交人').trim(), det = g('管理明细').trim(), dt = g('日期').trim()
        if (!sub && !det && !dt) return null
        return { submitterId: sub ? await ctx.ensureUser(sub) : null, details: det || null, date: subDate(dt) }
      },
      jsonHeader: '管理细则JSON',
      fromJson: async (o: any, ctx: JodooCtx) => {
        if (!o?.submitterName && !o?.details && !o?.date) return null
        return { submitterId: o.submitterName ? await ctx.ensureUser(o.submitterName) : null, details: o.details || null, date: subDate(o.date) }
      },
    },
  ],
  resolveScalars: async (_get, scalars) => {
    if (!scalars.category) scalars.category = '案例分享'
  },
  dedupe: (s) => ({ keywords: s.keywords, createdAt: s.createdAt }),
}

export const JODOO_MODULES: Partial<Record<ResourceKey, JodooModule>> = {
  CUSTOMER,
  REQUIREMENT,
  CANDIDATE,
  KNOWLEDGE,
}
