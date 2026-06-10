/* eslint-disable @typescript-eslint/no-explicit-any */
// 全新环境一次性迁移：部门/角色/用户 + 四模块（客户/需求/候选人/知识库）+ 附件 URL。
// 前置：先跑 scripts/etl-fresh.py 产出 /tmp/booster-testdata/*.json 并解包附件到 uploads/。
// 幂等可重跑（按业务键 findFirst/upsert）。读 process.env.DATABASE_URL。
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any)
const DIR = '/tmp/booster-testdata'
const J = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const date = (s: any) => (s ? new Date(String(s)) : null)
const arr = (s: any) => (s ? String(s).split(/[,，、;；]/).map((x) => x.trim()).filter(Boolean) : [])

// ── 人员口径（客户确认）────────────────────────────────────────────────────────
// 在职 7 人按清单（账号大小写按清单原样）；数据里出现、不在清单 = 已离职（部门空，后续 admin 移交）。
// Eric Tang 与 唐日德 是同一人（归 trd）。初始密码统一 123456。
const INITIAL_PASSWORD = '123456'
const ALIAS: Record<string, string> = { 'Eric Tang': '唐日德' }
const FIXED = [
  { name: '张文婷', username: 'ZWT', dept: '交付一部', role: '客户交付负责人' },
  { name: '麦诗敏', username: 'MSM', dept: '交付二部', role: '客户交付负责人' },
  { name: '郑蕊', username: 'ZR', dept: '交付三部', role: '客户交付负责人' },
  { name: '刘一舟', username: 'LYZ', dept: '交付一部', role: null },
  { name: '刘士赟', username: 'LSY', dept: '交付二部', role: null },
  { name: '唐日德', username: 'trd', dept: '公司', role: null },
  { name: '肖艳华', username: 'xyh', dept: '公司', role: null },
] as const
const DEPARTED = [
  { name: '冯洁', username: 'FJ' },
  { name: '陈伟银', username: 'CWY' },
  { name: '尹水路', username: 'YSL' },
  { name: '蔡漫玲', username: 'CML' },
] as const
const DEPTS = ['公司', '交付一部', '交付二部', '交付三部']

const norm = (s: any) => {
  if (!s) return null
  const t = String(s).replace(/\s*\[已离职\]\s*/g, '').trim()
  return ALIAS[t] ?? t
}

async function main() {
  const fail: string[] = []
  const unresolved = new Map<string, number>() // 找不到用户的提交人 → 行数（回退 admin）

  // ── ① 部门：总部 → 公司（保管理员外键），补交付一/二/三部 ──
  const hq = await prisma.department.findFirst({ where: { name: '总部' } })
  if (hq) await prisma.department.update({ where: { id: hq.id }, data: { name: '公司' } })
  const deptId = new Map<string, number>()
  for (const n of DEPTS) {
    const ex = await prisma.department.findFirst({ where: { name: n } })
    deptId.set(n, ex ? ex.id : (await prisma.department.create({ data: { name: n } })).id)
  }

  // ── ② 角色 ──
  const role = await prisma.role.upsert({
    where: { name: '客户交付负责人' },
    update: {},
    create: { name: '客户交付负责人', description: '部门客户交付负责人' },
  })

  // ── ③ 用户（含离职）──
  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10)
  const userId = new Map<string, number>() // 姓名 → id
  const userDept = new Map<string, number | null>()
  for (const u of FIXED) {
    const did = deptId.get(u.dept)!
    const row = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, departmentId: did, roleId: u.role ? role.id : null },
      create: {
        name: u.name, username: u.username, passwordHash,
        departmentId: did, roleId: u.role ? role.id : null,
      },
      select: { id: true },
    })
    userId.set(u.name, row.id)
    userDept.set(u.name, did)
  }
  for (const u of DEPARTED) {
    const row = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name },
      create: { name: u.name, username: u.username, passwordHash, departmentId: null },
      select: { id: true },
    })
    userId.set(u.name, row.id)
    userDept.set(u.name, null)
  }
  // admin 归「公司」
  const admin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } })
  if (!admin) throw new Error('无管理员（先跑 seed）')
  await prisma.user.update({ where: { id: admin.id }, data: { departmentId: deptId.get('公司')! } })

  const resolve = (submitter: any): number => {
    const n = norm(submitter)
    if (n && userId.has(n)) return userId.get(n)!
    if (n) unresolved.set(n, (unresolved.get(n) ?? 0) + 1)
    return admin.id
  }
  const owners = new Map<string, number>() // 归属统计：姓名 → 行数
  const own = (uid: number) => {
    const name = [...userId.entries()].find(([, v]) => v === uid)?.[0] ?? 'admin'
    owners.set(name, (owners.get(name) ?? 0) + 1)
  }

  // ── ④ 客户 ──
  const byFull = new Map<string, number>(), byShort = new Map<string, number>()
  let cCreated = 0
  for (const c of J('customers.json')) {
    try {
      let id: number
      const ex = await prisma.customer.findFirst({ where: { fullName: c.fullName }, select: { id: true } })
      if (ex) id = ex.id
      else {
        const uid = resolve(c.submitter)
        const row = await prisma.customer.create({
          data: {
            fullName: c.fullName, shortName: c.shortName, industry: c.industry || null,
            region: c.region, detailedAddress: c.detailedAddress,
            formerName: c.formerName || null, openingSpeech: c.openingSpeech || null,
            benchmarkCompanies: c.benchmarkCompanies || null,
            attachmentUrl: c.attachmentUrl || null,
            createdAt: date(c.createdAt) ?? undefined, createdById: uid,
          },
          select: { id: true },
        })
        id = row.id; cCreated++; own(uid)
      }
      byFull.set(c.fullName, id); byShort.set(c.shortName, id)
    } catch (e: any) { fail.push(`客户「${c.fullName}」: ${e.message?.slice(0, 120)}`) }
  }

  // ── ⑤ 需求 ──
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
        const uid = resolve(q.submitter)
        const row = await prisma.requirement.create({
          data: {
            customerId: cid, recruiter: q.recruiter || null, positionName: q.positionName,
            headcount: q.headcount ?? 1, monthlySalary: q.monthlySalary || null,
            annualSalary: q.annualSalary || null, ageRange: q.ageRange || null,
            baseCity: q.baseCity || '—',
            genderRequirement: q.genderRequirement || null, educationRequirement: q.educationRequirement || null,
            languageRequirement: q.languageRequirement || null, status: q.status || [],
            jobDescription: q.jobDescription || null, talentProfile: q.talentProfile || null,
            projectExperience: q.projectExperience || null, closeReason: q.closeReason || null,
            notes: q.notes || null, industry: q.industry || null, latestUpdate: q.latestUpdate || null,
            deadline: date(q.deadline), attachmentUrl: q.attachmentUrl || null,
            createdAt: date(q.createdAt) ?? undefined, createdById: uid,
          },
          select: { id: true },
        })
        id = row.id; rCreated++; own(uid)
      }
      reqIdx.set(`${cid}|${q.positionName}`, id)
    } catch (e: any) { fail.push(`需求「${q.positionName}」: ${e.message?.slice(0, 120)}`) }
  }

  // ── ⑥ 候选人 ──
  let kCreated = 0
  for (const p of J('candidates.json')) {
    const cid = byShort.get(p.customerShortName) ?? byFull.get(p.customerShortName) ?? null
    const rid = cid && p.positionName ? reqIdx.get(`${cid}|${p.positionName}`) ?? null : null
    try {
      const dup = await prisma.candidate.findFirst({
        where: { name: p.name, customerShortName: p.customerShortName || null, requirementId: rid },
        select: { id: true },
      })
      if (dup) continue
      const uid = resolve(p.submitter)
      const subName = norm(p.submitter)
      await prisma.candidate.create({
        data: {
          name: p.name, customerId: cid, customerShortName: p.customerShortName || null, requirementId: rid,
          recommendationStatus: p.recommendationStatus || 'PENDING', recruitmentChannel: p.recruitmentChannel || '其他',
          recommendationTime: date(p.recommendationTime),
          interviewProgress: p.interviewProgress || null, education: p.education || null,
          schoolTier: p.schoolTier ?? [], // String[]：list 字段不可传 null
          phone: p.phone || null, email: p.email || null, birthYear: p.birthYear || null, tags: arr(p.tags),
          recruitmentParty: p.recruitmentParty || null, recommendationReason: p.recommendationReason || null,
          failureReason: p.failureReason || null, salaryPlan: p.salaryPlan || null, notes: p.notes || null,
          guaranteePeriodEnd: date(p.guaranteePeriodEnd),
          offerFileUrl: p.offerFileUrl || null, backgroundCheckReportUrl: p.backgroundCheckReportUrl || null,
          submitterId: uid,
          submitDepartmentId: (subName && userDept.get(subName)) || null,
          createdAt: date(p.createdAt) ?? undefined, createdById: uid,
        },
      })
      kCreated++; own(uid)
    } catch (e: any) {
      const tail = String(e.message ?? '').split('\n').map((x: string) => x.trim()).filter(Boolean).slice(-2).join(' | ')
      fail.push(`候选人「${p.name}」: ${tail.slice(0, 220)}`)
    }
  }

  // ── ⑦ 知识库（实例 + 管理细则子表）──
  let kbCreated = 0, recCreated = 0
  for (const g of J('knowledge.json')) {
    try {
      const created = date(g.createdAt)
      const ex = await prisma.knowledgeBase.findFirst({
        where: { keywords: g.keywords, ...(created ? { createdAt: created } : {}) },
        select: { id: true },
      })
      if (ex) continue
      const uid = resolve(g.submitter)
      const lecturer = norm(g.internalLecturer)
      await prisma.knowledgeBase.create({
        data: {
          keywords: g.keywords, category: g.category, tags: g.tags ?? [],
          fileUrl: g.fileUrl || null, trainingOutline: g.trainingOutline || null,
          internalLecturerId: lecturer && userId.has(lecturer) ? userId.get(lecturer)! : null,
          externalLecturer: g.externalLecturer || null,
          createdAt: created ?? undefined, createdById: uid,
          managementRecords: {
            create: (g.records ?? []).map((r: any) => ({
              date: date(r.date), details: r.details || null,
              submitterId: norm(r.submitter) && userId.has(norm(r.submitter)!) ? userId.get(norm(r.submitter)!)! : null,
            })),
          },
        },
      })
      kbCreated++; recCreated += (g.records ?? []).length; own(uid)
    } catch (e: any) { fail.push(`知识库「${String(g.keywords).slice(0, 20)}」: ${e.message?.slice(0, 120)}`) }
  }

  // ── 汇总 ──
  const counts = {
    dept: await prisma.department.count(), role: await prisma.role.count(), user: await prisma.user.count(),
    customer: await prisma.customer.count(), requirement: await prisma.requirement.count(),
    candidate: await prisma.candidate.count(), knowledge: await prisma.knowledgeBase.count(),
    records: await prisma.knowledgeManagementRecord.count(),
  }
  console.log('\n== 全新环境迁移结果 ==')
  console.log(`部门=${counts.dept} 角色=${counts.role} 用户=${counts.user}`)
  console.log(`本次新建：客户+${cCreated} 需求+${rCreated} 候选人+${kCreated} 知识库+${kbCreated}(细则+${recCreated})`)
  console.log(`库内总量：客户=${counts.customer} 需求=${counts.requirement} 候选人=${counts.candidate} 知识库=${counts.knowledge}(细则=${counts.records})`)
  console.log('归属分布:', Object.fromEntries([...owners.entries()].sort((a, b) => b[1] - a[1])))
  if (unresolved.size) console.log('⚠️ 未识别提交人(已回退 admin):', Object.fromEntries(unresolved))
  console.log(`失败: ${fail.length}`)
  fail.slice(0, 20).forEach((f) => console.log('  - ' + f))
  await prisma.$disconnect(); await pool.end()
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1) })
