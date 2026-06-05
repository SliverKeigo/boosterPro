/* eslint-disable @typescript-eslint/no-explicit-any */
// 各模块的导入配置（服务端）。新增模块即在 CONFIGS 加一项：声明字段/关系/子表。
import { prisma } from '@/lib/prisma'
import type { ImportResource } from '@/lib/importServer'
import { EDUCATION_LEVEL_LABELS, SCHOOL_TIER_LABELS, RECOMMENDATION_STATUS_LABELS } from '@/lib/enums'

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
const TIER_IN = mapEnum(reverse(SCHOOL_TIER_LABELS))
const RECSTATUS_IN = mapEnum(reverse(RECOMMENDATION_STATUS_LABELS))

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
      { header: '简历及相关资料', field: 'resumeUrl' },
    ],
  },

  CANDIDATE: {
    model: 'candidate',
    fields: [
      { header: '姓名', field: 'name', required: true },
      { header: '出生年份', field: 'birthYear', type: 'int' },
      { header: '联系电话', field: 'phone' },
      { header: '邮箱', field: 'email' },
      { header: '教育经历', field: 'education', transform: EDU_IN },
      { header: '院校', field: 'schoolTier', transform: TIER_IN },
      { header: '客户名称', field: 'customerId', relation: { idField: 'customerId', resolve: resolveCustomer } },
      { header: '客户简称', field: 'customerShortName' },
      { header: '招聘需求方', field: 'recruitmentParty' },
      { header: '岗位名称', field: 'requirementId', relation: { idField: 'requirementId', resolve: resolveRequirement } },
      { header: '推荐时间', field: 'recommendationTime', type: 'date' },
      { header: '招聘渠道', field: 'recruitmentChannel', required: true },
      { header: '推荐报告', field: 'recommendationReportUrl' },
      { header: '推荐状态', field: 'recommendationStatus', required: true, transform: RECSTATUS_IN },
      { header: '推荐理由', field: 'recommendationReason' },
      { header: '面试进展', field: 'interviewProgress' },
      { header: '推荐失败原因', field: 'failureReason' },
      { header: 'offer日期', field: 'offerDate', type: 'date' },
      { header: 'offer到岗日期', field: 'offerOnboardDate', type: 'date' },
      { header: 'Offer', field: 'offerFileUrl' },
      { header: '背景调查报告', field: 'backgroundCheckReportUrl' },
      { header: '实际到岗日期', field: 'actualOnboardDate', type: 'date' },
      { header: '薪酬方案', field: 'salaryPlan' },
      { header: '保证期结束日期', field: 'guaranteePeriodEnd', type: 'date' },
      { header: '保证期时长(月)', field: 'guaranteePeriodMonths', type: 'int' },
      { header: '备注', field: 'notes' },
      { header: '候选人标签', field: 'tags', type: 'string[]' },
    ],
    subtables: [
      { header: '保证期沟通记录(JSON)', relationField: 'guaranteeCommunications', fields: [{ key: 'date', type: 'date' }, { key: 'content' }] },
      { header: '风险管理(JSON)', relationField: 'riskEvents', fields: [{ key: 'date', type: 'date' }, { key: 'riskDescription' }] },
    ],
  },
}
