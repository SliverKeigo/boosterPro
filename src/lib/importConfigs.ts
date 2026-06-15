/* eslint-disable @typescript-eslint/no-explicit-any */
// 各模块的导入配置（服务端）。新增模块即在 CONFIGS 加一项：声明字段/关系/子表。
import { prisma } from '@/lib/prisma'
import type { ImportResource, ImportDedup } from '@/lib/importServer'
import { normalizePhone } from '@/lib/candidateData'
import { EDUCATION_LEVEL_LABELS, SCHOOL_TIER_LABELS, RECOMMENDATION_STATUS_LABELS, OPPORTUNITY_NATURE_LABELS } from '@/lib/enums'

// ── 关系按名称唯一反查 id：重名 → 抛错（该行报错）；查无 → 返回 null（buildRow 报「找不到匹配」）──
async function resolveUnique(model: string, where: any, label: string): Promise<number | null> {
  const found = await (prisma as any)[model].findMany({ where, select: { id: true }, take: 2 })
  if (found.length > 1) throw new Error(`${label}「${describe(where)}」重名，无法唯一匹配，请改用唯一名称`)
  return found[0]?.id ?? null
}
function describe(where: any): string {
  if (where?.OR) return where.OR.map((o: any) => Object.values(o)[0]).join('/')
  return String(Object.values(where)[0])
}

export const resolveCustomer = (name: string) =>
  resolveUnique('customer', { OR: [{ shortName: name }, { fullName: name }] }, '客户')
export const resolveRequirement = (name: string) =>
  resolveUnique('requirement', { positionName: name }, '岗位')
export const resolveUserByName = (name: string) => resolveUnique('user', { name }, '用户')

// 枚举值映射工具：未命中返回 undefined（buildRow 视为「无法识别的值」→ 该行报错）
const mapEnum = (m: Record<string, string>) => (raw: any) => m[String(raw).trim()]

const GENDER_IN = mapEnum({ 男: 'MALE', 女: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE' })

// 中文 label → 枚举 key（导入用）。基于 enums.ts 的 *_LABELS 反转。
const reverse = (labels: Record<string, string>) =>
  Object.fromEntries(Object.entries(labels).map(([k, v]) => [v, k]))
const EDU_IN = mapEnum(reverse(EDUCATION_LEVEL_LABELS))
// 院校层次现为 String[]：单元格按「、,，/」分隔多个中文标签，逐个反查成枚举 key 数组。
// 任一标签无法识别 → 返回 undefined（buildRow 视为「无法识别的值」→ 该行报错）。
const TIER_LABEL_TO_KEY = reverse(SCHOOL_TIER_LABELS)
const TIER_ARR_IN = (raw: any): string[] | undefined => {
  const parts = String(raw).split(/[、,，/]+/).map((s) => s.trim()).filter(Boolean)
  const keys: string[] = []
  for (const p of parts) {
    const k = TIER_LABEL_TO_KEY[p]
    if (k === undefined) return undefined
    keys.push(k)
  }
  return keys
}
const RECSTATUS_IN = mapEnum(reverse(RECOMMENDATION_STATUS_LABELS))
const GENDER_REQ_IN = mapEnum({ 男: 'MALE', 女: 'FEMALE', 不限: 'ANY', MALE: 'MALE', FEMALE: 'FEMALE', ANY: 'ANY' })
const OPP_NATURE_IN = mapEnum(reverse(OPPORTUNITY_NATURE_LABELS))

// ── 导入查重配置（复用 assertCustomerUnique / assertCandidateUnique 同款取键逻辑）──

// 客户名称取键：全称 / 简称去空（trim 后非空）
const customerDedupNames = (s: any): string[] =>
  [s.fullName, s.shortName]
    .map((v: any) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v: string) => v.length > 0)

// 客户：全称 fullName / 简称 shortName 任一与库中任一客户的 fullName/shortName 重复（交叉、大小写不敏感）
const CUSTOMER_DEDUP: ImportDedup = {
  label: '客户名称/简称',
  keys: customerDedupNames,
  findExisting: async (s, excludeId) => {
    const names = customerDedupNames(s)
    if (!names.length) return null
    const hit = await prisma.customer.findFirst({
      where: {
        id: excludeId != null ? { not: excludeId } : undefined,
        OR: [
          { fullName: { in: names, mode: 'insensitive' } },
          { shortName: { in: names, mode: 'insensitive' } },
        ],
      },
      select: { fullName: true, shortName: true },
    })
    if (!hit) return null
    const lowered = names.map((n) => n.toLowerCase())
    const dup =
      (hit.fullName && lowered.includes(hit.fullName.trim().toLowerCase()) ? hit.fullName : null) ??
      (hit.shortName && lowered.includes(hit.shortName.trim().toLowerCase()) ? hit.shortName : null) ??
      names[0]
    const existingLabel = hit.fullName || hit.shortName || ''
    return `客户名称/简称「${dup}」与现有客户「${existingLabel}」重复`
  },
}

// 候选人取键：姓名 name 与规整手机号 phone 都非空时返回展示串，否则空（不参与查重）
const candidateNamePhone = (s: any): { name: string; phone: string } | null => {
  const name = typeof s.name === 'string' ? s.name.trim() : ''
  const phone = normalizePhone(s.phone)
  if (!name || !phone) return null
  return { name, phone }
}

// 候选人：姓名 name + 手机号 phone（规整后）组合唯一；空姓名或空手机号不参与
const CANDIDATE_DEDUP: ImportDedup = {
  label: '候选人',
  keys: (s) => {
    const np = candidateNamePhone(s)
    return np ? [`姓名${np.name}+手机号${np.phone}`] : []
  },
  findExisting: async (s, excludeId) => {
    const np = candidateNamePhone(s)
    if (!np) return null
    const hit = await prisma.candidate.findFirst({
      where: { id: excludeId != null ? { not: excludeId } : undefined, name: np.name, phone: np.phone },
      select: { id: true },
    })
    return hit ? `候选人「姓名${np.name}+手机号${np.phone}」已存在` : null
  },
}

export const CONFIGS: Record<string, ImportResource> = {
  TALENT_POOL: {
    model: 'talentPool',
    fields: [
      { header: '姓名', field: 'name', required: true },
      { header: '性别', field: 'gender', transform: GENDER_IN },
      { header: '出生年月', field: 'birthYear' }, // YYYY-MM 文本
      { header: '最高学历', field: 'education' },
      { header: '联系电话', field: 'phone' },
      { header: '当前职位', field: 'currentPosition', required: true },
      { header: '意向职位', field: 'targetPosition' },
      { header: '所属行业', field: 'positionType' },
      { header: '职位级别', field: 'positionLevel' },
      { header: '人才标签', field: 'tags', type: 'string[]' },
      { header: '简历及相关资料', field: 'resumeUrl', type: 'urls' },
    ],
  },

  CANDIDATE: {
    model: 'candidate',
    dedup: CANDIDATE_DEDUP,
    fields: [
      { header: '姓名', field: 'name', required: true },
      { header: '出生年份', field: 'birthYear', type: 'int' }, // Int 年份
      { header: '联系电话', field: 'phone' },
      { header: '邮箱', field: 'email' },
      { header: '教育经历', field: 'education', transform: EDU_IN },
      { header: '院校', field: 'schoolTier', transform: TIER_ARR_IN }, // String[]：中文标签→key 数组
      { header: '客户名称', field: 'customerId', relation: { idField: 'customerId', resolve: resolveCustomer } },
      { header: '客户简称', field: 'customerShortName' },
      { header: '招聘需求方', field: 'recruitmentParty' },
      { header: '岗位名称', field: 'requirementId', relation: { idField: 'requirementId', resolve: resolveRequirement } },
      { header: '推荐时间', field: 'recommendationTime', type: 'date' },
      { header: '招聘渠道', field: 'recruitmentChannel', required: true },
      { header: '推荐报告', field: 'recommendationReportUrl', type: 'urls' },
      { header: '推荐状态', field: 'recommendationStatus', required: true, transform: RECSTATUS_IN },
      { header: '推荐理由', field: 'recommendationReason' },
      { header: '面试进展', field: 'interviewProgress' },
      { header: '推荐失败原因', field: 'failureReason' },
      { header: 'offer日期', field: 'offerDate', type: 'date' },
      { header: 'offer到岗日期', field: 'offerOnboardDate', type: 'date' },
      { header: 'Offer', field: 'offerFileUrl', type: 'urls' },
      { header: '背景调查报告', field: 'backgroundCheckReportUrl', type: 'urls' },
      { header: '实际到岗日期', field: 'actualOnboardDate', type: 'date' },
      { header: '薪酬方案', field: 'salaryPlan' },
      { header: '保证期结束日期', field: 'guaranteePeriodEnd', type: 'date' },
      { header: '保证期时长(月)', field: 'guaranteePeriodMonths', type: 'int' },
      { header: '备注', field: 'notes' },
      { header: '候选人标签', field: 'tags', type: 'string[]' },
    ],
    subtables: [
      { header: '保证期沟通记录（日期 | 内容）', relationField: 'guaranteeCommunications', fields: [{ key: 'date', type: 'date' }, { key: 'content' }] },
      { header: '风险管理（日期 | 风险描述）', relationField: 'riskEvents', fields: [{ key: 'date', type: 'date' }, { key: 'riskDescription' }] },
    ],
  },

  CUSTOMER: {
    model: 'customer',
    dedup: CUSTOMER_DEDUP,
    fields: [
      { header: '客户全称', field: 'fullName' },
      { header: '客户简称', field: 'shortName', required: true },
      { header: '曾用名', field: 'formerName' },
      { header: '定位', field: 'location' },
      { header: '所属行业', field: 'industry' },
      { header: '区域', field: 'region', required: true },
      { header: '详细地址', field: 'detailedAddress', required: true },
      { header: '企业文化', field: 'companyCulture' },
      { header: '开场白', field: 'openingSpeech' },
      { header: '对标企业', field: 'benchmarkCompanies' },
      { header: '附件', field: 'attachmentUrl', type: 'urls' },
    ],
    subtables: [
      { header: '办公地址（地址）', relationField: 'officeAddresses', fields: [{ key: 'address' }] },
    ],
  },

  REQUIREMENT: {
    model: 'requirement',
    fields: [
      { header: '客户名称', field: 'customerId', required: true, relation: { idField: 'customerId', resolve: resolveCustomer } },
      { header: '招聘负责人', field: 'recruiter' },
      { header: '岗位名称', field: 'positionName', required: true },
      { header: '招聘人数', field: 'headcount', type: 'int', required: true },
      { header: '月薪范围', field: 'monthlySalary' },
      { header: '年薪范围', field: 'annualSalary' }, // 纯文本
      { header: '年龄范围', field: 'ageRange' }, // 纯文本
      { header: '性别要求', field: 'genderRequirement', transform: GENDER_REQ_IN },
      { header: '学历要求', field: 'educationRequirement' },
      { header: '语言要求', field: 'languageRequirement' },
      { header: '岗位状态', field: 'status', type: 'string[]' },
      { header: '截止日期', field: 'deadline', type: 'date' },
      { header: 'base城市', field: 'baseCity', required: true },
      { header: '职位描述', field: 'jobDescription' },
      { header: '人才画像', field: 'talentProfile' },
      { header: '项目经验', field: 'projectExperience' },
      { header: '关闭原因', field: 'closeReason' },
      { header: '备注', field: 'notes' },
      { header: '附件', field: 'attachmentUrl', type: 'urls' },
      { header: '最新进展', field: 'latestUpdate' },
      { header: '所属行业', field: 'industry' },
      { header: '加分项', field: 'bonusPoints' },
      { header: '行业与资源', field: 'industryResources' },
      { header: '跟进日期', field: 'followDate', type: 'date' },
    ],
    subtables: [
      { header: '职位知识画像（知识类别 | 知识要求 | 共识要求）', relationField: 'positionProfiles', fields: [{ key: 'knowledgeCategory' }, { key: 'knowledgeAmount' }, { key: 'consensusRequirement' }] },
    ],
  },

  CLIENT_SUPPLEMENT: {
    model: 'clientSupplement',
    fields: [
      { header: '客户名称', field: 'customerId', required: true, relation: { idField: 'customerId', resolve: resolveCustomer } },
      { header: '需求客户', field: 'demandCustomer' },
      { header: '开场白', field: 'openingSpeech' },
      { header: '企业文化福利', field: 'companyCultureWelfare' },
      { header: '备注', field: 'notes' },
      { header: '附件', field: 'attachmentUrl', type: 'urls' },
    ],
    subtables: [
      { header: '需求更新（日期 | 内容）', relationField: 'demandUpdates', fields: [{ key: 'date', type: 'date' }, { key: 'content' }] },
      { header: '客户特长画像（专长 | 描述 | 附件）', relationField: 'customerProfiles', fields: [{ key: 'specialty' }, { key: 'description' }, { key: 'attachmentUrl', type: 'urls-csv' }] },
    ],
  },

  CUSTOMER_CONTACT: {
    model: 'customerContact',
    fields: [
      { header: '标题', field: 'title', required: true },
      { header: '客户名称', field: 'customerId', required: true, relation: { idField: 'customerId', resolve: resolveCustomer } },
    ],
    subtables: [
      { header: '联系人（姓名 | 职位 | 电话 | 邮箱 | 爱好）', relationField: 'contacts', fields: [{ key: 'contactName' }, { key: 'contactTitle' }, { key: 'contactPhone' }, { key: 'contactEmail' }, { key: 'contactHobby' }] },
    ],
  },

  OPPORTUNITY: {
    model: 'opportunity',
    fields: [
      { header: '商机名称', field: 'name', required: true },
      { header: '描述', field: 'description', required: true },
      { header: '区域', field: 'region', required: true },
      { header: '状态', field: 'status', omitIfEmpty: true },
      { header: '性质', field: 'nature', transform: OPP_NATURE_IN, omitIfEmpty: true },
      { header: '联系人姓名', field: 'contactName' },
      { header: '联系人职位', field: 'contactTitle' },
      { header: '联系方式', field: 'contactInfo' },
      { header: '销售决策信息', field: 'salesDecisionInfo', required: true },
      { header: '客户决策人', field: 'customerDecisionMaker', required: true },
      { header: '决策人描述', field: 'decisionMakerDescription', required: true },
      { header: '销售负责人', field: 'salesOwnerId', relation: { idField: 'salesOwnerId', resolve: resolveUserByName } },
      { header: '附件', field: 'attachmentUrl', type: 'urls' },
    ],
    subtables: [
      { header: '进展记录（日期 | 描述）', relationField: 'progressRecords', fields: [{ key: 'date', type: 'date' }, { key: 'description' }] },
    ],
  },

  CONTRACT: {
    model: 'contract',
    fields: [
      { header: '客户名称', field: 'customerId', required: true, relation: { idField: 'customerId', resolve: resolveCustomer } },
      { header: '合同名称', field: 'contractName', required: true },
      { header: '签订年份', field: 'signingYear', type: 'int', required: true },
      { header: '生效开始', field: 'effectiveStart', type: 'date', required: true },
      { header: '生效结束', field: 'effectiveEnd', type: 'date', required: true },
      { header: '到期日期', field: 'expiryDate', type: 'date', required: true },
      { header: '服务类型', field: 'serviceType', required: true },
      { header: '猎头费率', field: 'headhunterFeeRate', type: 'number' },
      { header: '开票月数', field: 'billingMonths', type: 'int' },
      { header: 'ROP费率', field: 'ropFeeRate', type: 'number' },
      { header: '销售负责人', field: 'salesOwnerId', relation: { idField: 'salesOwnerId', resolve: resolveUserByName } },
      { header: '交付负责人', field: 'deliveryOwnerId', relation: { idField: 'deliveryOwnerId', resolve: resolveUserByName } },
      { header: '合同文件', field: 'contractFileUrl', type: 'urls', required: true },
      { header: '开票信息', field: 'invoiceInfoText' },
      { header: '开票信息文件', field: 'invoiceInfoFileUrl', type: 'urls' },
      { header: '备注', field: 'notes' },
    ],
    subtables: [
      { header: '发票（类型 | 核销结果 | 金额 | 号码 | 代码 | 开票日期 | 源文件 | 图片）', relationField: 'invoices', fields: [{ key: 'invoiceType' }, { key: 'verificationResult' }, { key: 'amount' }, { key: 'number' }, { key: 'code' }, { key: 'issueDate', type: 'date' }, { key: 'sourceFileUrl', type: 'urls-csv' }, { key: 'imageUrl', type: 'urls-csv' }] },
    ],
  },

  KNOWLEDGE: {
    model: 'knowledgeBase',
    fields: [
      { header: '分类', field: 'category', required: true },
      { header: '标签', field: 'tags', type: 'string[]' },
      { header: '关键词', field: 'keywords', required: true },
      { header: '文件', field: 'fileUrl', type: 'urls' },
      { header: '备注', field: 'notes' },
      { header: '培训大纲', field: 'trainingOutline' },
      { header: '内部讲师', field: 'internalLecturerId', relation: { idField: 'internalLecturerId', resolve: resolveUserByName } },
      { header: '外部讲师', field: 'externalLecturer' },
    ],
    subtables: [
      { header: '管理记录（日期 | 详情 | 评审参与人）', relationField: 'managementRecords', fields: [{ key: 'date', type: 'date' }, { key: 'details' }, { key: 'reviewParticipants' }] },
    ],
  },
}
