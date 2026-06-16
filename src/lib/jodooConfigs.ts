/* eslint-disable @typescript-eslint/no-explicit-any */
// 四模块的封存包列映射（客户/需求/候选人/知识库）。**按第 1 行表头列名定位**（不依赖列序：
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

// ── 枚举：中文 → schema 枚举 key。未命中 undefined → 该行报错 ──
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
  // 先按 客户名称(全称)/简称 匹配；找不到再按 客户曾用名(formerName) 兜底（客户改过名时仍能挂上）
  const c = await prisma.customer.findFirst({ where: { OR: [{ fullName: name }, { shortName: name }] }, select: { id: true } })
  if (c) return c.id
  const byFormer = await prisma.customer.findFirst({ where: { formerName: name }, select: { id: true } })
  return byFormer?.id ?? null
}
const subDate = (s: string): Date | null => dateVal(s) ?? null
// 子表附件 JSON 兼容：本系统新导出包是 URL 数组、旧包/简道云是单值字符串 → 统一成数组
const toUrlArr = (x: any): string[] => (Array.isArray(x) ? x.filter(Boolean) : x ? [String(x)] : [])

// ── 四模块配置 ────────────────────────────────────────────────────────────────
const CUSTOMER: JodooModule = {
  model: 'customer',
  tableName: 'customers',
  updatedAtHeader: '修改时间',
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
    { header: '定位', field: 'location' }, // 简道云定位组件＝位置文字，原样导入
  ],
  attachments: [{ header: '客户附件资料', field: 'attachmentUrl' }],
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
  tableName: 'requirements',
  updatedAtHeader: '修改时间',
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
    { header: '加分项', field: 'bonusPoints' },
    { header: '行业与资源', field: 'industryResources' },
  ],
  attachments: [{ header: '附件', field: 'attachmentUrl' }],
  groupKeyHeaders: ['客户名称', '岗位名称', '创建时间'],
  subtables: [
    {
      relationField: 'positionProfiles', match: '知识分类',
      build: async (g) => {
        const cat = g('知识分类').trim(), amt = g('知识解读').trim(), con = g('形成的共识和管理要求').trim()
        if (!cat && !amt && !con) return null
        return { knowledgeCategory: cat || null, knowledgeAmount: amt || null, consensusRequirement: con || null }
      },
      jsonHeader: '岗位画像JSON',
      fromJson: async (o: any) => {
        if (!o?.knowledgeCategory && !o?.knowledgeAmount && !o?.consensusRequirement) return null
        return { knowledgeCategory: o.knowledgeCategory || null, knowledgeAmount: o.knowledgeAmount || null, consensusRequirement: o.consensusRequirement || null }
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
  dedupe: (s) => ({ customerId: s.customerId, positionName: s.positionName, createdAt: s.createdAt }),
}

const CANDIDATE: JodooModule = {
  model: 'candidate',
  tableName: 'candidates',
  updatedAtHeader: '修改时间',
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
    { header: '招聘渠道', field: 'recruitmentChannel' },
    { header: 'offer日期', field: 'offerDate', transform: dateVal },
    { header: 'offer到岗日期', field: 'offerOnboardDate', transform: dateVal },
    { header: '实际到岗日期', field: 'actualOnboardDate', transform: dateVal },
  ],
  attachments: [
    { header: 'Offer', field: 'offerFileUrl' },
    { header: '背景调查报告', field: 'backgroundCheckReportUrl' },
    { header: '推荐报告', field: 'recommendationReportUrl' }, // 多附件(String[])；表头按客户实际命名「推荐报告」(原「推荐报告附件」客户已自行改名)
  ],
  // 封存包无独立「推荐人」列：录入候选人推荐的「提交人」即推荐顾问，同列也映射到推荐人(submitterId)
  userFields: [{ header: '提交人', field: 'submitterId' }],
  groupKeyHeaders: ['候选人姓名', '客户简称', '岗位名称', '创建时间'],
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
    if (!scalars.recruitmentChannel) scalars.recruitmentChannel = '其他' // 招聘渠道 NOT NULL：包有值则用包值，空才兜底「其他」
    if (!scalars.recommendationStatus) scalars.recommendationStatus = 'PENDING'
  },
  dedupe: (s) => ({ name: s.name, customerShortName: s.customerShortName ?? null, requirementId: s.requirementId ?? null, createdAt: s.createdAt }),
}

const KNOWLEDGE: JodooModule = {
  model: 'knowledgeBase',
  tableName: 'knowledge_base',
  updatedAtHeader: '修改时间',
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
        const sub = g('提交人').trim(), det = g('管理明细').trim(), dt = g('日期').trim(), rev = g('评审参与人').trim()
        if (!sub && !det && !dt && !rev) return null
        return { submitterId: sub ? await ctx.ensureUser(sub) : null, details: det || null, date: subDate(dt), reviewParticipants: rev || null }
      },
      jsonHeader: '管理细则JSON',
      fromJson: async (o: any, ctx: JodooCtx) => {
        if (!o?.submitterName && !o?.details && !o?.date) return null
        return { submitterId: o.submitterName ? await ctx.ensureUser(o.submitterName) : null, details: o.details || null, date: subDate(o.date), reviewParticipants: o.reviewParticipants || null }
      },
    },
  ],
  resolveScalars: async (_get, scalars) => {
    if (!scalars.category) scalars.category = '案例分享'
  },
  dedupe: (s) => ({ keywords: s.keywords, createdAt: s.createdAt }),
}

const TALENT_POOL: JodooModule = {
  model: 'talentPool',
  tableName: 'talent_pool',
  label: '人才储备库',
  signature: ['人才姓名', '意向职位', '当前职位'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  updatedAtHeader: '修改时间',
  fields: [
    { header: '人才姓名', field: 'name', required: true },
    { header: '意向职位', field: 'targetPosition' },
    { header: '联系电话', field: 'phone' },
    { header: '性别', field: 'gender', transform: GENDER },
    { header: '最高学历', field: 'education' },
    { header: '人才标签', field: 'tags', transform: arr },
    { header: '职位类型', field: 'positionType' },
    { header: '职位级别', field: 'positionLevel' },
    { header: '出生年份', field: 'birthYear', transform: yearVal },
    { header: '当前职位', field: 'currentPosition' },
  ],
  attachments: [{ header: '简历及相关资料', field: 'resumeUrl' }],
  resolveScalars: async (_get, scalars) => {
    // currentPosition / resumeUrl 在 schema 为 NOT NULL；当前职位缺失时用意向职位兜底（简历列均有 FINST）
    if (!scalars.currentPosition) scalars.currentPosition = (scalars.targetPosition as string) || '—'
  },
  dedupe: (s) => ({ name: s.name, createdAt: s.createdAt }),
}

const CUSTOMER_CONTACT: JodooModule = {
  model: 'customerContact',
  tableName: 'customer_contacts',
  label: '客户联系人信息',
  signature: ['客户名称', '实例标题', '客户联系人信息'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  updatedAtHeader: '修改时间',
  fields: [
    { header: '实例标题', field: 'title', required: true },
  ],
  resolveScalars: async (get, scalars) => {
    const cn = stripFinst(get('客户名称'))
    if (!cn) throw new Error('缺少「客户名称」')
    const cid = await findCustomerId(cn)
    if (cid == null) throw new Error(`找不到客户「${cn}」，请先导入客户基本信息`)
    scalars.customerId = cid
    if (!scalars.title) scalars.title = `${cn}联系人`
  },
  subtables: [{
    relationField: 'contacts', match: '联系人姓名',
    build: async (g) => {
      const nm = g('联系人姓名').trim()
      if (!nm) return null
      return { contactName: nm, contactTitle: g('联系人职务').trim() || null, contactPhone: g('联系人电话').trim() || null, contactEmail: g('联系人邮箱').trim() || null, contactHobby: g('联系人爱好').trim() || null }
    },
    jsonHeader: '联系人JSON',
    fromJson: async (o: any) => (o?.contactName ? { contactName: o.contactName, contactTitle: o.contactTitle || null, contactPhone: o.contactPhone || null, contactEmail: o.contactEmail || null, contactHobby: o.contactHobby || null } : null),
  }],
  dedupe: (s) => ({ customerId: s.customerId, title: s.title, createdAt: s.createdAt }),
}

const CLIENT_SUPPLEMENT: JodooModule = {
  model: 'clientSupplement',
  tableName: 'client_supplements',
  label: '客户交付补充信息',
  signature: ['客户名称', '开聊话术', '需求客户'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  updatedAtHeader: '修改时间',
  fields: [
    { header: '需求客户', field: 'demandCustomer' },
    { header: '开聊话术', field: 'openingSpeech' },
  ],
  // 封存包「备注」列实为附件(FINST 引用，如 餐厅介绍.pdf)，落盘到主表 attachmentUrl；本系统的「备注」文本字段(notes)封存包无对应列，不导
  attachments: [{ header: '备注', field: 'attachmentUrl' }],
  resolveScalars: async (get, scalars) => {
    const cn = stripFinst(get('客户名称'))
    if (!cn) throw new Error('缺少「客户名称」')
    const cid = await findCustomerId(cn)
    if (cid == null) throw new Error(`找不到客户「${cn}」，请先导入客户基本信息`)
    scalars.customerId = cid
  },
  // 子表展开行归并 key：同「客户名称+创建时间」的多行＝一条补充 + 子表多行；缺此则每行独立、子表只导第一条
  groupKeyHeaders: ['客户名称', '创建时间'],
  subtables: [
    {
      relationField: 'demandUpdates', match: '需求更新内容',
      build: async (g) => {
        const ct = g('需求更新内容').trim(), dt = g('日期').trim()
        if (!ct && !dt) return null
        return { date: dateVal(dt) ?? null, content: ct || null }
      },
      jsonHeader: '需求更新JSON',
      fromJson: async (o: any) => ((o?.content || o?.date) ? { date: dateVal(o.date) ?? null, content: o.content || null } : null),
    },
    {
      relationField: 'customerProfiles', match: '专项',
      build: async (g, ctx) => {
        const sp = g('专项').trim(), ds = g('专项描述').trim(), att = g('附件').trim()
        if (!sp && !ds && !att) return null
        return { specialty: sp || null, description: ds || null, attachmentUrl: await ctx.resolveAttachments(att) }
      },
      jsonHeader: '客户画像JSON',
      fromJson: async (o: any) => ((o?.specialty || o?.description || o?.attachmentUrl?.length || (typeof o?.attachmentUrl === 'string' && o.attachmentUrl)) ? { specialty: o.specialty || null, description: o.description || null, attachmentUrl: toUrlArr(o.attachmentUrl) } : null),
    },
  ],
  dedupe: (s) => ({ customerId: s.customerId, createdAt: s.createdAt }),
}

// 商机/合同专用：枚举、费率(取数字)、合同有效期区间(取前两个日期为起止)
const NATURE = mapEnum({ 直接客户: 'DIRECT', 间接客户: 'INDIRECT' })
const decVal = (s: string) => { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isNaN(n) ? undefined : n }
const periodSplit = (raw: string): [Date | null, Date | null] => {
  const ds = String(raw).match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g) || []
  return [ds[0] ? dateVal(ds[0]) ?? null : null, ds[1] ? dateVal(ds[1]) ?? null : null]
}

const OPPORTUNITY: JodooModule = {
  model: 'opportunity',
  tableName: 'opportunities',
  label: '商机信息',
  signature: ['商机名称', '商机描述', '所属区域'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  updatedAtHeader: '修改时间',
  fields: [
    { header: '商机名称', field: 'name', required: true },
    { header: '商机描述', field: 'description' },
    { header: '所属区域', field: 'region' },
    { header: '商机状态', field: 'status' },
    { header: '商机性质', field: 'nature', transform: NATURE },
    { header: '商机联系人', field: 'contactName' },
    { header: '商机联系人职务', field: 'contactTitle' },
    { header: '商机联系人电话/EMAIL/微信', field: 'contactInfo' },
    { header: '公司销售决策信息', field: 'salesDecisionInfo' },
    { header: '客户决策人', field: 'customerDecisionMaker' },
    { header: '决策人相关信息描述', field: 'decisionMakerDescription' },
  ],
  attachments: [{ header: '附件1', field: 'attachmentUrl' }],
  userFields: [{ header: '销售负责人', field: 'salesOwnerId' }],
  groupKeyHeaders: ['商机名称', '创建时间'],
  resolveScalars: async (_get, scalars) => {
    // NOT NULL 字段兜底
    if (!scalars.description) scalars.description = '—'
    if (!scalars.region) scalars.region = '—'
    if (!scalars.status) scalars.status = '线索阶段'
    if (!scalars.salesDecisionInfo) scalars.salesDecisionInfo = '—'
    if (!scalars.customerDecisionMaker) scalars.customerDecisionMaker = '—'
    if (!scalars.decisionMakerDescription) scalars.decisionMakerDescription = '—'
  },
  subtables: [{
    relationField: 'progressRecords', match: '进展描述',
    build: async (g) => {
      const ds = g('进展描述').trim(), dt = g('日期').trim()
      if (!ds && !dt) return null
      return { date: dateVal(dt) ?? null, description: ds || null }
    },
    jsonHeader: '商机进展JSON',
    fromJson: async (o: any) => ((o?.description || o?.date) ? { date: dateVal(o.date) ?? null, description: o.description || null } : null),
  }],
  dedupe: (s) => ({ name: s.name, createdAt: s.createdAt }),
}

const CONTRACT: JodooModule = {
  model: 'contract',
  tableName: 'contracts',
  label: '销售合同信息管理',
  signature: ['客户名称', '合同名称', '服务类型'],
  submitterHeader: '提交人',
  createdAtHeader: '创建时间',
  updatedAtHeader: '修改时间',
  fields: [
    { header: '合同名称', field: 'contractName', required: true },
    { header: '签订年份', field: 'signingYear', transform: yearVal },
    { header: '服务类型', field: 'serviceType' },
    { header: '猎头服务费率%', field: 'headhunterFeeRate', transform: decVal },
    { header: '计费月数', field: 'billingMonths', transform: intVal },
    { header: 'ROP服务费率', field: 'ropFeeRate', transform: decVal },
    { header: '备注', field: 'notes' },
    { header: '合同到期日期', field: 'expiryDate', transform: dateVal },
    { header: '开票信息', field: 'invoiceInfoText' },
  ],
  attachments: [{ header: '合同附件', field: 'contractFileUrl' }],
  userFields: [{ header: '销售负责人', field: 'salesOwnerId' }, { header: '交付负责人', field: 'deliveryOwnerId' }],
  groupKeyHeaders: ['客户名称', '合同名称', '创建时间'],
  resolveScalars: async (get, scalars) => {
    const cn = stripFinst(get('客户名称'))
    if (!cn) throw new Error('缺少「客户名称」')
    const cid = await findCustomerId(cn)
    if (cid == null) throw new Error(`找不到客户「${cn}」，请先导入客户基本信息`)
    scalars.customerId = cid
    // 合同有效期「起_止」拆分；NOT NULL 字段兜底
    const [s, e] = periodSplit(get('合同有效期'))
    scalars.effectiveStart = s ?? (scalars.createdAt as Date) ?? new Date(0)
    scalars.effectiveEnd = e ?? scalars.effectiveStart
    if (!scalars.expiryDate) scalars.expiryDate = scalars.effectiveEnd
    if (!scalars.serviceType) scalars.serviceType = '—'
    if (scalars.signingYear == null) scalars.signingYear = new Date(scalars.effectiveStart).getFullYear()
  },
  subtables: [{
    relationField: 'invoices', match: '发票类型',
    build: async (g, ctx) => {
      const it = g('发票类型').trim(), vr = g('查验结果').trim(), am = g('发票金额').trim(), nm = g('发票号码').trim(), cd = g('发票代码').trim(), idt = g('开票日期').trim(), sf = g('发票源文件').trim(), img = g('发票图片').trim()
      if (![it, vr, am, nm, cd, idt, sf, img].some((x) => x)) return null
      return { invoiceType: it || null, verificationResult: vr || null, amount: am || null, number: nm || null, code: cd || null, issueDate: dateVal(idt) ?? null, sourceFileUrl: await ctx.resolveAttachments(sf), imageUrl: await ctx.resolveAttachments(img) }
    },
    jsonHeader: '发票JSON',
    fromJson: async (o: any) => (([o?.invoiceType, o?.verificationResult, o?.amount, o?.number, o?.code, o?.issueDate, o?.sourceFileUrl, o?.imageUrl].some((x) => (Array.isArray(x) ? x.length : x))) ? { invoiceType: o.invoiceType || null, verificationResult: o.verificationResult || null, amount: o.amount || null, number: o.number || null, code: o.code || null, issueDate: dateVal(o.issueDate) ?? null, sourceFileUrl: toUrlArr(o.sourceFileUrl), imageUrl: toUrlArr(o.imageUrl) } : null),
  }],
  dedupe: (s) => ({ customerId: s.customerId, contractName: s.contractName, createdAt: s.createdAt }),
}

export const JODOO_MODULES: Partial<Record<ResourceKey, JodooModule>> = {
  CUSTOMER,
  REQUIREMENT,
  CANDIDATE,
  KNOWLEDGE,
  TALENT_POOL,
  CUSTOMER_CONTACT,
  CLIENT_SUPPLEMENT,
  OPPORTUNITY,
  CONTRACT,
}
