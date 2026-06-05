/* eslint-disable @typescript-eslint/no-explicit-any */
// 「可回导」导出列（客户端，无 prisma）。表头须与服务端 importConfigs 一致，以保证导出→改→导入闭环。
// 关系列导出名称、子表列导出 JSON 数组、首列固定 id（导入据此判定更新/新增）。

import { EDUCATION_LEVEL_LABELS, SCHOOL_TIER_LABELS, RECOMMENDATION_STATUS_LABELS } from '@/lib/enums'

export interface RoundTripColumn {
  header: string
  getValue: (row: any) => any
}

const GENDER_LABELS: Record<string, string> = { MALE: '男', FEMALE: '女' }
const fmtDate = (s: any) => (s ? String(s).slice(0, 10) : '')
const joinTags = (t: any) => (Array.isArray(t) ? t.join('、') : (t ?? ''))

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
    { header: '简历及相关资料', getValue: (r) => r.resumeUrl ?? '' },
  ],

  CANDIDATE: [
    { header: 'id', getValue: (r) => r.id },
    { header: '姓名', getValue: (r) => r.name ?? '' },
    { header: '出生年份', getValue: (r) => r.birthYear ?? '' },
    { header: '联系电话', getValue: (r) => r.phone ?? '' },
    { header: '邮箱', getValue: (r) => r.email ?? '' },
    { header: '教育经历', getValue: (r) => EDUCATION_LEVEL_LABELS[r.education] ?? '' },
    { header: '院校', getValue: (r) => SCHOOL_TIER_LABELS[r.schoolTier] ?? '' },
    { header: '客户名称', getValue: (r) => r.customer?.shortName ?? r.customer?.fullName ?? '' },
    { header: '客户简称', getValue: (r) => r.customerShortName ?? '' },
    { header: '招聘需求方', getValue: (r) => r.recruitmentParty ?? '' },
    { header: '岗位名称', getValue: (r) => r.requirement?.positionName ?? '' },
    { header: '推荐时间', getValue: (r) => fmtDate(r.recommendationTime) },
    { header: '招聘渠道', getValue: (r) => r.recruitmentChannel ?? '' },
    { header: '推荐报告', getValue: (r) => r.recommendationReportUrl ?? '' },
    { header: '推荐状态', getValue: (r) => RECOMMENDATION_STATUS_LABELS[r.recommendationStatus] ?? '' },
    { header: '推荐理由', getValue: (r) => r.recommendationReason ?? '' },
    { header: '面试进展', getValue: (r) => r.interviewProgress ?? '' },
    { header: '推荐失败原因', getValue: (r) => r.failureReason ?? '' },
    { header: 'offer日期', getValue: (r) => fmtDate(r.offerDate) },
    { header: 'offer到岗日期', getValue: (r) => fmtDate(r.offerOnboardDate) },
    { header: 'Offer', getValue: (r) => r.offerFileUrl ?? '' },
    { header: '背景调查报告', getValue: (r) => r.backgroundCheckReportUrl ?? '' },
    { header: '实际到岗日期', getValue: (r) => fmtDate(r.actualOnboardDate) },
    { header: '薪酬方案', getValue: (r) => r.salaryPlan ?? '' },
    { header: '保证期结束日期', getValue: (r) => fmtDate(r.guaranteePeriodEnd) },
    { header: '保证期时长(月)', getValue: (r) => r.guaranteePeriodMonths ?? '' },
    { header: '备注', getValue: (r) => r.notes ?? '' },
    { header: '候选人标签', getValue: (r) => joinTags(r.tags) },
    { header: '保证期沟通记录(JSON)', getValue: (r) => JSON.stringify((r.guaranteeCommunications ?? []).map((x: any) => ({ date: fmtDate(x.date), content: x.content ?? '' }))) },
    { header: '风险管理(JSON)', getValue: (r) => JSON.stringify((r.riskEvents ?? []).map((x: any) => ({ date: fmtDate(x.date), riskDescription: x.riskDescription ?? '' }))) },
  ],
}
