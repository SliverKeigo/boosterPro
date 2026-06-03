/**
 * Prisma enum 的中文 label 映射与下拉 options 集中定义。
 *
 * Prisma client 实际返回 / 接收的是枚举的【英文 key】（如 'BACHELOR'、'PENDING'、'LEAD'），
 * schema 里的 @map 中文值只用于数据库存储。因此：
 *   - XXX_LABELS：英文 key → 中文 label（用于渲染展示）。
 *   - XXX_OPTIONS：[{ value: 英文 key, label: 中文 }]（用于下拉框）。
 * label 文案以 prisma/schema.prisma 各 enum 的 @map 中文值为准。
 */

export interface EnumOption {
  value: string
  label: string
}

/** 由 LABELS 映射生成下拉 options，保持声明顺序 */
function toOptions(labels: Record<string, string>): EnumOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

/** EducationLevel —— 学历 */
export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  BACHELOR: '本科',
  MASTER: '硕士',
  DOCTOR: '博士',
  ASSOCIATE: '大专',
  OTHER: '其他',
}
export const EDUCATION_LEVEL_OPTIONS: EnumOption[] = toOptions(EDUCATION_LEVEL_LABELS)

/** SchoolTier —— 院校层次 */
export const SCHOOL_TIER_LABELS: Record<string, string> = {
  T985_211: '985/211',
  GENERAL_FIRST: '普通一流',
  GENERAL: '普通',
  OVERSEAS: '海外留学',
}
export const SCHOOL_TIER_OPTIONS: EnumOption[] = toOptions(SCHOOL_TIER_LABELS)

/** GenderType —— 性别 */
export const GENDER_TYPE_LABELS: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
  ANY: '不限',
}
export const GENDER_TYPE_OPTIONS: EnumOption[] = toOptions(GENDER_TYPE_LABELS)

/** RecommendationStatus —— 推荐状态 */
export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
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
export const RECOMMENDATION_STATUS_OPTIONS: EnumOption[] = toOptions(RECOMMENDATION_STATUS_LABELS)

// 商机状态【不走枚举】：Opportunity.status 是普通 String，库里存字典 opportunity_status 的中文值
// (客户仅给「线索阶段」一项)，前端用 useDict('opportunity_status') 取值。原先这里的英文 key 映射
// (LEAD/PROSPECT/…) 与实际存储体系不一致、且臆造了文档禁止的多个阶段，已删除以免被误用。

/** OpportunityNature —— 商机性质 */
export const OPPORTUNITY_NATURE_LABELS: Record<string, string> = {
  DIRECT: '直接客户',
  INDIRECT: '间接客户',
}
export const OPPORTUNITY_NATURE_OPTIONS: EnumOption[] = toOptions(OPPORTUNITY_NATURE_LABELS)
