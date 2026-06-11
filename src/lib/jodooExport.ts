/* eslint-disable @typescript-eslint/no-explicit-any */
// 导出引擎：把模块数据导成「封存包」zip（与导入对称，可再导回）。
// 结构：外层 zip 含 <tag>_excel.zip（数据 xlsx）+ <tag>_resources_1.zip（附件）。
// xlsx：双行表头(第1=2行，用简道云列名让导入引擎认) + 第3行起数据；
//   主表列＝字段反向(枚举→中文/数组→拼接/日期→串/关系→名称/提交人→姓名)；
//   子表＝一个 JSON 列(jsonHeader，值为记录数组，导入端 fromJson 解回)；
//   附件＝FINST 引用(FINST-EXP<记录id>N<序号>/<文件名>)，文件放进 resources.zip。
import { prisma } from '@/lib/prisma'
import { HttpError } from '@/lib/apiError'
import type { ResourceKey } from '@/lib/resources'
import { promises as fs } from 'fs'
import path from 'path'

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads')

// 反向映射（与 jodooConfigs 的正向一一对应）
const GENDER_OUT: Record<string, string> = { MALE: '男', FEMALE: '女', ANY: '不限' }
const EDU_OUT: Record<string, string> = { BACHELOR: '本科', MASTER: '硕士', DOCTOR: '博士', ASSOCIATE: '大专', OTHER: '其他' }
const TIER_OUT: Record<string, string> = { T985_211: '985/211', GENERAL_FIRST: '双一流', GENERAL: '普通', OVERSEAS: '海外留学' }
const RSTATUS_OUT: Record<string, string> = {
  RESUME_FAILED: '简历失败', INTERNAL_RESUME_FAILED: '简历(内推)失败', INTERVIEW_SCHEDULE_FAILED: '约面失败',
  INTERVIEW_FAILED: '面试失败', SALARY_NEGO_FAILED: '谈薪失败', OFFER_FAILED: 'offer失败', ONBOARD_FAILED: '入职失败',
  NOT_PASSED_GUARANTEE: '未过保', RESIGNED_POST_GUARANTEE: '简历挂起（已面）', RESIGNED_LOCAL: '简历挂起（未面）',
  PENDING: '已推荐，待反馈', INTERVIEWING: '面试中', SALARY_NEGO: '谈薪中', OFFERING: 'Offer中',
  ONBOARDING: '入职中', GUARANTEE: '保证期', POST_GUARANTEE_CLOSED: '过保关闭',
}
const joinArr = (a: any) => (Array.isArray(a) ? a.join('、') : (a ?? ''))
const fmtDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const fmtDateTime = (d: any) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '')
const tiersOut = (a: any) => (Array.isArray(a) ? a.map((k: string) => TIER_OUT[k] ?? k).join('、') : '')

interface ExportCol { header: string; get: (r: any) => any }
interface ExportSub { jsonHeader: string; toJson: (r: any) => any[] }
interface ExportAttach { header: string; get: (r: any) => string | null } // 返回附件 URL（/api/files/xxx）或 null
interface ExportDef { model: string; tag: string; include: any; columns: ExportCol[]; subs: ExportSub[]; attachments: ExportAttach[] }

const DEFS: Partial<Record<ResourceKey, ExportDef>> = {
  CUSTOMER: {
    model: 'customer', tag: '客户基本信息表',
    include: { officeAddresses: true, createdBy: { select: { name: true } } },
    columns: [
      { header: '客户名称', get: (r) => r.fullName },
      { header: '客户简称', get: (r) => r.shortName },
      { header: '公司地址', get: (r) => [r.region, r.detailedAddress].filter((x) => x && x !== '—' && x !== '其他').join('/') },
      { header: '所属行业', get: (r) => r.industry },
      { header: '对标企业', get: (r) => r.benchmarkCompanies },
      { header: '开聊话术', get: (r) => r.openingSpeech },
      { header: '客户曾用名', get: (r) => r.formerName },
      { header: '提交人', get: (r) => r.createdBy?.name },
      { header: '创建时间', get: (r) => fmtDateTime(r.createdAt) },
    ],
    subs: [{ jsonHeader: '办公地址JSON', toJson: (r) => (r.officeAddresses ?? []).map((o: any) => ({ address: o.address })) }],
    attachments: [{ header: '客户附件资料', get: (r) => r.attachmentUrl }],
  },
  REQUIREMENT: {
    model: 'requirement', tag: '招聘需求信息表',
    include: { customer: { select: { fullName: true } }, createdBy: { select: { name: true } }, positionProfiles: true, urgentRecords: { include: { member: { select: { name: true } } } } },
    columns: [
      { header: '客户名称', get: (r) => r.customer?.fullName },
      { header: '招聘需求方', get: (r) => r.recruiter },
      { header: '岗位名称', get: (r) => r.positionName },
      { header: '岗位状态', get: (r) => joinArr(r.status) },
      { header: '月薪范围', get: (r) => r.monthlySalary },
      { header: '年薪范围(万)', get: (r) => r.annualSalary },
      { header: '年龄范围', get: (r) => r.ageRange },
      { header: 'Base城市', get: (r) => r.baseCity },
      { header: '需求人数', get: (r) => r.headcount },
      { header: '性别要求', get: (r) => GENDER_OUT[r.genderRequirement] ?? '' },
      { header: '学历要求', get: (r) => r.educationRequirement },
      { header: '语言要求', get: (r) => r.languageRequirement },
      { header: '岗位JD', get: (r) => r.jobDescription },
      { header: '人才简易画像', get: (r) => r.talentProfile },
      { header: '项目经验', get: (r) => r.projectExperience },
      { header: '关闭/暂停原因', get: (r) => r.closeReason },
      { header: '其他备注', get: (r) => r.notes },
      { header: '所属行业', get: (r) => r.industry },
      { header: '最新动态', get: (r) => r.latestUpdate },
      { header: '招聘重启日期', get: (r) => fmtDate(r.deadline) },
      { header: '提交人', get: (r) => r.createdBy?.name },
      { header: '创建时间', get: (r) => fmtDateTime(r.createdAt) },
    ],
    subs: [
      { jsonHeader: '岗位画像JSON', toJson: (r) => (r.positionProfiles ?? []).map((p: any) => ({ knowledgeCategory: p.knowledgeCategory, knowledgeAmount: p.knowledgeAmount })) },
      { jsonHeader: '加急记录JSON', toJson: (r) => (r.urgentRecords ?? []).map((u: any) => ({ memberName: u.member?.name ?? null, date: fmtDate(u.date) })) },
    ],
    attachments: [{ header: '附件', get: (r) => r.attachmentUrl }],
  },
  CANDIDATE: {
    model: 'candidate', tag: '候选人推荐信息表',
    include: { createdBy: { select: { name: true } }, requirement: { select: { positionName: true } }, guaranteeCommunications: true, riskEvents: true },
    columns: [
      { header: '客户简称', get: (r) => r.customerShortName },
      { header: '岗位名称', get: (r) => r.requirement?.positionName },
      { header: '候选人姓名', get: (r) => r.name },
      { header: '推荐时间', get: (r) => fmtDateTime(r.recommendationTime) },
      { header: '推荐状态', get: (r) => RSTATUS_OUT[r.recommendationStatus] ?? '' },
      { header: '面试进展', get: (r) => r.interviewProgress },
      { header: '教育经历', get: (r) => EDU_OUT[r.education] ?? '' },
      { header: '候选人联系电话', get: (r) => r.phone },
      { header: '候选人标签', get: (r) => joinArr(r.tags) },
      { header: '院校', get: (r) => tiersOut(r.schoolTier) },
      { header: '保证期结束日期', get: (r) => fmtDate(r.guaranteePeriodEnd) },
      { header: '招聘需求方', get: (r) => r.recruitmentParty },
      { header: '候选人邮箱', get: (r) => r.email },
      { header: '备注', get: (r) => r.notes },
      { header: '出生年份', get: (r) => r.birthYear },
      { header: '薪酬方案', get: (r) => r.salaryPlan },
      { header: '推荐理由', get: (r) => r.recommendationReason },
      { header: '推荐失败原因描述', get: (r) => r.failureReason },
      { header: '提交人', get: (r) => r.createdBy?.name },
      { header: '创建时间', get: (r) => fmtDateTime(r.createdAt) },
    ],
    subs: [
      { jsonHeader: '保证期沟通JSON', toJson: (r) => (r.guaranteeCommunications ?? []).map((g: any) => ({ date: fmtDate(g.date), content: g.content })) },
      { jsonHeader: '风险事件JSON', toJson: (r) => (r.riskEvents ?? []).map((e: any) => ({ date: fmtDate(e.date), riskDescription: e.riskDescription })) },
    ],
    attachments: [
      { header: 'Offer', get: (r) => r.offerFileUrl },
      { header: '背景调查报告', get: (r) => r.backgroundCheckReportUrl },
    ],
  },
  KNOWLEDGE: {
    model: 'knowledgeBase', tag: '公司知识库',
    include: { createdBy: { select: { name: true } }, internalLecturer: { select: { name: true } }, managementRecords: { include: { submitter: { select: { name: true } } } } },
    columns: [
      { header: '关键词', get: (r) => r.keywords },
      { header: '知识分类', get: (r) => r.category },
      { header: '知识标签', get: (r) => joinArr(r.tags) },
      { header: '内部讲师', get: (r) => r.internalLecturer?.name },
      { header: '外部讲师', get: (r) => r.externalLecturer },
      { header: '培训提纲', get: (r) => r.trainingOutline },
      { header: '提交人', get: (r) => r.createdBy?.name },
      { header: '创建时间', get: (r) => fmtDateTime(r.createdAt) },
    ],
    subs: [{ jsonHeader: '管理细则JSON', toJson: (r) => (r.managementRecords ?? []).map((m: any) => ({ submitterName: m.submitter?.name ?? null, details: m.details, date: fmtDate(m.date) })) }],
    attachments: [{ header: '知识文件', get: (r) => r.fileUrl }],
  },
}

export function exportSupported(resource: string): boolean {
  return !!DEFS[resource as ResourceKey]
}

export async function runExport(resource: string): Promise<{ buffer: Buffer; filename: string }> {
  const def = DEFS[resource as ResourceKey]
  if (!def) throw new HttpError(400, `该模块暂不支持封存包导出：${resource}`)
  const records = await (prisma as any)[def.model].findMany({ include: def.include, orderBy: { id: 'asc' } })

  const ex: any = await import('exceljs')
  const ExcelJS = ex.default ?? ex
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('数据')
  const headers = [...def.columns.map((c) => c.header), ...def.subs.map((s) => s.jsonHeader), ...def.attachments.map((a) => a.header)]
  ws.addRow(headers)
  ws.addRow(headers) // 双行表头：与简道云一致、让导入引擎按第 1 行列名定位、第 3 行起读数据

  const jz: any = await import('jszip')
  const JSZip = jz.default ?? jz
  const resZip = new JSZip()
  let seq = 0
  for (const r of records) {
    const row: any[] = []
    for (const c of def.columns) row.push(c.get(r) ?? '')
    for (const s of def.subs) { const arr = s.toJson(r).filter(Boolean); row.push(arr.length ? JSON.stringify(arr) : '') }
    for (const a of def.attachments) {
      const url = a.get(r)
      if (!url) { row.push(''); continue }
      const fp = path.join(UPLOAD_DIR, path.basename(url))
      try {
        const buf = await fs.readFile(fp)
        const finst = `FINST-EXP${r.id}N${seq++}`
        const name = path.basename(url)
        resZip.file(`${finst}/${name}`, buf)
        row.push(`${finst}/${name}`)
      } catch {
        row.push('') // 附件文件缺失 → 列空
      }
    }
    ws.addRow(row)
  }

  const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer())
  const exZip = new JSZip()
  exZip.file('数据.xlsx', xlsxBuf)
  const exBuf = await exZip.generateAsync({ type: 'nodebuffer' })
  const resBuf = await resZip.generateAsync({ type: 'nodebuffer' })

  const outer = new JSZip()
  outer.file(`${def.tag}_excel.zip`, exBuf)
  outer.file(`${def.tag}_resources_1.zip`, resBuf)
  const buffer: Buffer = await outer.generateAsync({ type: 'nodebuffer' })
  const stamp = new Date().toISOString().slice(0, 10)
  return { buffer, filename: `${def.tag}_${stamp}.zip` }
}
