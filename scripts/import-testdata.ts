/* eslint-disable @typescript-eslint/no-explicit-any */
// 一次性：把 /tmp/booster-testdata 的清洗后 JSON 导入本地 dev 库。用完即删。
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { readFileSync } from 'fs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)
const DIR = '/tmp/booster-testdata'
const J = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const date = (s: any) => (s ? new Date(String(s).replace(' ', 'T')) : null)
const arr = (s: any) => (s ? String(s).split(/[,，、;；]/).map((x) => x.trim()).filter(Boolean) : [])

async function main() {
  const admin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true, departmentId: true } })
  if (!admin) throw new Error('无管理员用户')
  const uid = admin.id, dep = admin.departmentId
  const before = {
    c: await prisma.customer.count(), r: await prisma.requirement.count(), k: await prisma.candidate.count(),
  }
  const fail: string[] = []

  // ── 客户 ──
  const byFull = new Map<string, number>(), byShort = new Map<string, number>()
  let cCreated = 0
  for (const c of J('customers.json')) {
    try {
      let id: number
      const ex = await prisma.customer.findFirst({ where: { fullName: c.fullName }, select: { id: true } })
      if (ex) id = ex.id
      else {
        const row = await prisma.customer.create({
          data: {
            fullName: c.fullName, shortName: c.shortName, industry: c.industry || null,
            region: c.region, detailedAddress: c.detailedAddress,
            formerName: c.formerName || null, openingSpeech: c.openingSpeech || null,
            benchmarkCompanies: c.benchmarkCompanies || null, createdById: uid,
          },
          select: { id: true },
        })
        id = row.id; cCreated++
      }
      byFull.set(c.fullName, id); byShort.set(c.shortName, id)
    } catch (e: any) { fail.push(`客户「${c.fullName}」: ${e.message?.slice(0, 120)}`) }
  }

  // ── 需求 ── 按客户全称解析；建立 (customerId|岗位名) → reqId
  const reqIdx = new Map<string, number>()
  let rCreated = 0
  for (const q of J('requirements.json')) {
    const cid = byFull.get(q.customerName) ?? byShort.get(q.customerName)
    if (!cid) { fail.push(`需求「${q.positionName}」: 找不到客户「${q.customerName}」`); continue }
    try {
      let id: number
      const ex = await prisma.requirement.findFirst({ where: { customerId: cid, positionName: q.positionName }, select: { id: true } })
      if (ex) id = ex.id
      else {
        const row = await prisma.requirement.create({
          data: {
            customerId: cid, recruiter: q.recruiter || null, positionName: q.positionName,
            headcount: q.headcount ?? 1, monthlySalary: q.monthlySalary || null, baseCity: q.baseCity || '—',
            genderRequirement: q.genderRequirement || null, educationRequirement: q.educationRequirement || null,
            languageRequirement: q.languageRequirement || null, status: q.status || [],
            jobDescription: q.jobDescription || null, talentProfile: q.talentProfile || null,
            projectExperience: q.projectExperience || null, closeReason: q.closeReason || null,
            notes: q.notes || null, industry: q.industry || null, latestUpdate: q.latestUpdate || null,
            createdById: uid,
          },
          select: { id: true },
        })
        id = row.id; rCreated++
      }
      reqIdx.set(`${cid}|${q.positionName}`, id)
    } catch (e: any) { fail.push(`需求「${q.positionName}」: ${e.message?.slice(0, 120)}`) }
  }

  // ── 候选人 ── 客户按简称、岗位按 (客户,岗位名) 解析（找不到则留空）
  let kCreated = 0
  for (const p of J('candidates.json')) {
    const cid = byShort.get(p.customerShortName) ?? byFull.get(p.customerShortName) ?? null
    const rid = cid && p.positionName ? reqIdx.get(`${cid}|${p.positionName}`) ?? null : null
    try {
      // 幂等：同名+同客户已存在则跳过（避免重复导入）
      const dup = await prisma.candidate.findFirst({ where: { name: p.name, customerShortName: p.customerShortName || null }, select: { id: true } })
      if (dup) continue
      await prisma.candidate.create({
        data: {
          name: p.name, customerId: cid, customerShortName: p.customerShortName || null, requirementId: rid,
          recommendationStatus: p.recommendationStatus || 'PENDING', recruitmentChannel: p.recruitmentChannel || '其他',
          recommendationTime: date(p.recommendationTime),
          interviewProgress: p.interviewProgress || null, education: p.education || null, schoolTier: p.schoolTier || null,
          phone: p.phone || null, email: p.email || null, birthYear: p.birthYear || null, tags: arr(p.tags),
          recruitmentParty: p.recruitmentParty || null, recommendationReason: p.recommendationReason || null,
          failureReason: p.failureReason || null, salaryPlan: p.salaryPlan || null, notes: p.notes || null,
          guaranteePeriodEnd: date(p.guaranteePeriodEnd),
          submitterId: uid, submitDepartmentId: dep, createdById: uid,
        },
      })
      kCreated++
    } catch (e: any) { fail.push(`候选人「${p.name}」: ${e.message?.slice(0, 140)}`) }
  }

  const after = {
    c: await prisma.customer.count(), r: await prisma.requirement.count(), k: await prisma.candidate.count(),
  }
  console.log(`\n== 导入结果 ==`)
  console.log(`客户  : +${cCreated}  (库 ${before.c} → ${after.c})`)
  console.log(`需求  : +${rCreated}  (库 ${before.r} → ${after.r})`)
  console.log(`候选人: +${kCreated}  (库 ${before.k} → ${after.k})`)
  console.log(`失败/跳过: ${fail.length}`)
  fail.slice(0, 20).forEach((f) => console.log('  - ' + f))
  await prisma.$disconnect(); await pool.end()
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1) })
