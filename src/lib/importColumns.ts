/* eslint-disable @typescript-eslint/no-explicit-any */
// 「可回导」导出列（客户端，无 prisma）。表头须与服务端 importConfigs 一致，以保证导出→改→导入闭环。
// 关系列导出名称、子表列导出「每行一条、字段用 ' | ' 分隔」的可读文本、首列固定 id（导入据此判定更新/新增）。

import { EDUCATION_LEVEL_LABELS, SCHOOL_TIER_LABELS, RECOMMENDATION_STATUS_LABELS, GENDER_TYPE_LABELS, OPPORTUNITY_NATURE_LABELS } from '@/lib/enums'

export interface RoundTripColumn {
  header: string
  getValue: (row: any) => any
}

const GENDER_LABELS: Record<string, string> = { MALE: '男', FEMALE: '女' }
const fmtDate = (s: any) => (s ? String(s).slice(0, 10) : '')
const joinTags = (t: any) => (Array.isArray(t) ? t.join('、') : (t ?? ''))
// 子表导出为「可读文本」：每行一条记录，字段按顺序用 ' | ' 分隔（与导入端 parseSubtable 一致）
const subRows = (rows: any, cells: (r: any) => any[]) =>
  (Array.isArray(rows) ? rows : []).map((r) => cells(r).map((v) => String(v ?? '')).join(' | ')).join('\n')

// 每个资源的必填列（导出给这些表头加 * 提示；导入端 parseWorkbook 会去掉 * 再匹配）。
// 口径＝各模块**表单**的「无条件必填」字段（映射到导出表头），与界面保持一致；条件必填(如需求的招聘重启日期/关闭原因)不计入。
export const REQUIRED_HEADERS: Record<string, string[]> = {
  TALENT_POOL: ['姓名', '当前职位', '简历及相关资料'],
  CANDIDATE: ['姓名', '出生年份', '联系电话', '邮箱', '教育经历', '客户名称', '客户简称', '招聘需求方', '岗位名称', '推荐时间', '招聘渠道', '推荐报告', '推荐状态', '推荐理由'],
  CUSTOMER: ['客户全称', '客户简称', '区域', '详细地址'],
  REQUIREMENT: ['客户名称', '岗位名称', '招聘人数', '月薪范围', '性别要求', '学历要求', '岗位状态', 'base城市'],
  CLIENT_SUPPLEMENT: ['客户名称'],
  CUSTOMER_CONTACT: ['标题', '客户名称'],
  OPPORTUNITY: ['商机名称', '描述', '区域', '状态', '性质', '销售决策信息', '客户决策人', '决策人描述', '销售负责人'],
  CONTRACT: ['客户名称', '合同名称', '签订年份', '生效开始', '生效结束', '到期日期', '服务类型', '合同文件'],
  KNOWLEDGE: ['分类', '标签', '关键词'],
}
// 必填表头加 * 标识
export const markRequired = (resource: string | undefined, header: string) =>
  resource && REQUIRED_HEADERS[resource]?.includes(header) ? `${header}*` : header

export const IMPORT_COLUMNS: Record<string, RoundTripColumn[]> = {
  TALENT_POOL: [
    { header: 'id', getValue: (r) => r.id },
    { header: '姓名', getValue: (r) => r.name ?? '' },
    { header: '性别', getValue: (r) => GENDER_LABELS[r.gender] ?? '' },
    { header: '出生年月', getValue: (r) => r.birthYear ?? '' },
    { header: '最高学历', getValue: (r) => r.education ?? '' },
    { header: '联系电话', getValue: (r) => r.phone ?? '' },
    { header: '当前职位', getValue: (r) => r.currentPosition ?? '' },
    { header: '意向职位', getValue: (r) => r.targetPosition ?? '' },
    { header: '所属行业', getValue: (r) => r.positionType ?? '' },
    { header: '职位级别', getValue: (r) => r.positionLevel ?? '' },
    { header: '人才标签', getValue: (r) => joinTags(r.tags) },
    { header: '简历及相关资料', getValue: (r) => (r.resumeUrl ?? []).join('\n') },
  ],

  CANDIDATE: [
    { header: 'id', getValue: (r) => r.id },
    { header: '姓名', getValue: (r) => r.name ?? '' },
    { header: '出生年份', getValue: (r) => r.birthYear ?? '' },
    { header: '联系电话', getValue: (r) => r.phone ?? '' },
    { header: '邮箱', getValue: (r) => r.email ?? '' },
    { header: '教育经历', getValue: (r) => EDUCATION_LEVEL_LABELS[r.education] ?? '' },
    { header: '院校', getValue: (r) => (Array.isArray(r.schoolTier) ? r.schoolTier.map((k: string) => SCHOOL_TIER_LABELS[k] ?? k).join('、') : '') },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '客户简称', getValue: (r) => r.customerShortName ?? '' },
    { header: '招聘需求方', getValue: (r) => r.recruitmentParty ?? '' },
    { header: '岗位名称', getValue: (r) => r.requirement?.positionName ?? '' },
    { header: '推荐时间', getValue: (r) => fmtDate(r.recommendationTime) },
    { header: '招聘渠道', getValue: (r) => r.recruitmentChannel ?? '' },
    { header: '推荐报告', getValue: (r) => (r.recommendationReportUrl ?? []).join('\n') },
    { header: '推荐状态', getValue: (r) => RECOMMENDATION_STATUS_LABELS[r.recommendationStatus] ?? '' },
    { header: '推荐理由', getValue: (r) => r.recommendationReason ?? '' },
    { header: '面试进展', getValue: (r) => r.interviewProgress ?? '' },
    { header: '推荐失败原因', getValue: (r) => r.failureReason ?? '' },
    { header: 'offer日期', getValue: (r) => fmtDate(r.offerDate) },
    { header: 'offer到岗日期', getValue: (r) => fmtDate(r.offerOnboardDate) },
    { header: 'Offer', getValue: (r) => (r.offerFileUrl ?? []).join('\n') },
    { header: '背景调查报告', getValue: (r) => (r.backgroundCheckReportUrl ?? []).join('\n') },
    { header: '实际到岗日期', getValue: (r) => fmtDate(r.actualOnboardDate) },
    { header: '薪酬方案', getValue: (r) => r.salaryPlan ?? '' },
    { header: '保证期结束日期', getValue: (r) => fmtDate(r.guaranteePeriodEnd) },
    { header: '保证期时长(月)', getValue: (r) => r.guaranteePeriodMonths ?? '' },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '候选人标签', getValue: (r) => joinTags(r.tags) },
    { header: '保证期沟通记录（日期 | 内容）', getValue: (r) => subRows(r.guaranteeCommunications, (x) => [fmtDate(x.date), x.content]) },
    { header: '风险管理（日期 | 风险描述）', getValue: (r) => subRows(r.riskEvents, (x) => [fmtDate(x.date), x.riskDescription]) },
  ],

  CUSTOMER: [
    { header: 'id', getValue: (r) => r.id },
    { header: '客户全称', getValue: (r) => r.fullName ?? '' },
    { header: '客户简称', getValue: (r) => r.shortName ?? '' },
    { header: '曾用名', getValue: (r) => r.formerName ?? '' },
    { header: '定位', getValue: (r) => r.location ?? '' },
    { header: '所属行业', getValue: (r) => r.industry ?? '' },
    { header: '区域', getValue: (r) => r.region ?? '' },
    { header: '详细地址', getValue: (r) => r.detailedAddress ?? '' },
    { header: '企业文化', getValue: (r) => r.companyCulture ?? '' },
    { header: '开场白', getValue: (r) => r.openingSpeech ?? '' },
    { header: '对标企业', getValue: (r) => r.benchmarkCompanies ?? '' },
    { header: '附件', getValue: (r) => (r.attachmentUrl ?? []).join('\n') },
    { header: '办公地址（地址）', getValue: (r) => subRows(r.officeAddresses, (x) => [x.address]) },
  ],

  REQUIREMENT: [
    { header: 'id', getValue: (r) => r.id },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '招聘负责人', getValue: (r) => r.recruiter ?? '' },
    { header: '岗位名称', getValue: (r) => r.positionName ?? '' },
    { header: '招聘人数', getValue: (r) => r.headcount ?? '' },
    { header: '月薪范围', getValue: (r) => r.monthlySalary ?? '' },
    { header: '年薪范围', getValue: (r) => r.annualSalary ?? '' },
    { header: '年龄范围', getValue: (r) => r.ageRange ?? '' },
    { header: '性别要求', getValue: (r) => GENDER_TYPE_LABELS[r.genderRequirement] ?? '' },
    { header: '学历要求', getValue: (r) => r.educationRequirement ?? '' },
    { header: '语言要求', getValue: (r) => r.languageRequirement ?? '' },
    { header: '岗位状态', getValue: (r) => (Array.isArray(r.status) ? r.status.join('、') : (r.status ?? '')) },
    { header: '截止日期', getValue: (r) => fmtDate(r.deadline) },
    { header: 'base城市', getValue: (r) => r.baseCity ?? '' },
    { header: '职位描述', getValue: (r) => r.jobDescription ?? '' },
    { header: '人才画像', getValue: (r) => r.talentProfile ?? '' },
    { header: '项目经验', getValue: (r) => r.projectExperience ?? '' },
    { header: '关闭原因', getValue: (r) => r.closeReason ?? '' },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '附件', getValue: (r) => (r.attachmentUrl ?? []).join('\n') },
    { header: '最新进展', getValue: (r) => r.latestUpdate ?? '' },
    { header: '所属行业', getValue: (r) => r.industry ?? '' },
    { header: '加分项', getValue: (r) => r.bonusPoints ?? '' },
    { header: '行业与资源', getValue: (r) => r.industryResources ?? '' },
    { header: '跟进日期', getValue: (r) => fmtDate(r.followDate) },
    { header: '职位知识画像（知识类别 | 知识要求 | 共识要求）', getValue: (r) => subRows(r.positionProfiles, (x) => [x.knowledgeCategory, x.knowledgeAmount, x.consensusRequirement]) },
  ],

  CLIENT_SUPPLEMENT: [
    { header: 'id', getValue: (r) => r.id },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '需求客户', getValue: (r) => r.demandCustomer ?? '' },
    { header: '开场白', getValue: (r) => r.openingSpeech ?? '' },
    { header: '企业文化福利', getValue: (r) => r.companyCultureWelfare ?? '' },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '附件', getValue: (r) => (r.attachmentUrl ?? []).join('\n') },
    { header: '需求更新（日期 | 内容）', getValue: (r) => subRows(r.demandUpdates, (x) => [fmtDate(x.date), x.content]) },
    { header: '客户特长画像（专长 | 描述 | 附件）', getValue: (r) => subRows(r.customerProfiles, (x) => [x.specialty, x.description, x.attachmentUrl]) },
  ],

  CUSTOMER_CONTACT: [
    { header: 'id', getValue: (r) => r.id },
    { header: '标题', getValue: (r) => r.title ?? '' },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '联系人（姓名 | 职位 | 电话 | 邮箱 | 爱好）', getValue: (r) => subRows(r.contacts, (x) => [x.contactName, x.contactTitle, x.contactPhone, x.contactEmail, x.contactHobby]) },
  ],

  OPPORTUNITY: [
    { header: 'id', getValue: (r) => r.id },
    { header: '商机名称', getValue: (r) => r.name ?? '' },
    { header: '描述', getValue: (r) => r.description ?? '' },
    { header: '区域', getValue: (r) => r.region ?? '' },
    { header: '状态', getValue: (r) => r.status ?? '' },
    { header: '性质', getValue: (r) => OPPORTUNITY_NATURE_LABELS[r.nature] ?? '' },
    { header: '联系人姓名', getValue: (r) => r.contactName ?? '' },
    { header: '联系人职位', getValue: (r) => r.contactTitle ?? '' },
    { header: '联系方式', getValue: (r) => r.contactInfo ?? '' },
    { header: '销售决策信息', getValue: (r) => r.salesDecisionInfo ?? '' },
    { header: '客户决策人', getValue: (r) => r.customerDecisionMaker ?? '' },
    { header: '决策人描述', getValue: (r) => r.decisionMakerDescription ?? '' },
    { header: '销售负责人', getValue: (r) => r.salesOwner?.name ?? '' },
    { header: '附件', getValue: (r) => (r.attachmentUrl ?? []).join('\n') },
    { header: '进展记录（日期 | 描述）', getValue: (r) => subRows(r.progressRecords, (x) => [fmtDate(x.date), x.description]) },
  ],

  CONTRACT: [
    { header: 'id', getValue: (r) => r.id },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '合同名称', getValue: (r) => r.contractName ?? '' },
    { header: '签订年份', getValue: (r) => r.signingYear ?? '' },
    { header: '生效开始', getValue: (r) => fmtDate(r.effectiveStart) },
    { header: '生效结束', getValue: (r) => fmtDate(r.effectiveEnd) },
    { header: '到期日期', getValue: (r) => fmtDate(r.expiryDate) },
    { header: '服务类型', getValue: (r) => r.serviceType ?? '' },
    { header: '猎头费率', getValue: (r) => r.headhunterFeeRate ?? '' },
    { header: '开票月数', getValue: (r) => r.billingMonths ?? '' },
    { header: 'ROP费率', getValue: (r) => r.ropFeeRate ?? '' },
    { header: '销售负责人', getValue: (r) => r.salesOwner?.name ?? '' },
    { header: '交付负责人', getValue: (r) => r.deliveryOwner?.name ?? '' },
    { header: '合同文件', getValue: (r) => (r.contractFileUrl ?? []).join('\n') },
    { header: '开票信息', getValue: (r) => r.invoiceInfoText ?? '' },
    { header: '开票信息文件', getValue: (r) => (r.invoiceInfoFileUrl ?? []).join('\n') },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '发票（类型 | 核销结果 | 金额 | 号码 | 代码 | 开票日期 | 源文件 | 图片）', getValue: (r) => subRows(r.invoices, (x) => [x.invoiceType, x.verificationResult, x.amount, x.number, x.code, fmtDate(x.issueDate), x.sourceFileUrl, x.imageUrl]) },
  ],

  KNOWLEDGE: [
    { header: 'id', getValue: (r) => r.id },
    { header: '分类', getValue: (r) => r.category ?? '' },
    { header: '标签', getValue: (r) => joinTags(r.tags) },
    { header: '关键词', getValue: (r) => r.keywords ?? '' },
    { header: '文件', getValue: (r) => (r.fileUrl ?? []).join('\n') },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '培训大纲', getValue: (r) => r.trainingOutline ?? '' },
    { header: '内部讲师', getValue: (r) => r.internalLecturer?.name ?? '' },
    { header: '外部讲师', getValue: (r) => r.externalLecturer ?? '' },
    { header: '管理记录（日期 | 详情 | 评审参与人）', getValue: (r) => subRows(r.managementRecords, (x) => [fmtDate(x.date), x.details, x.reviewParticipants]) },
  ],
}
