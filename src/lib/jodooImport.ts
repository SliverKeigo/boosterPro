/* eslint-disable @typescript-eslint/no-explicit-any */
// 简道云「封存包」导入引擎（服务端）。
// 输入：外层 zip（FormData "file"）→ 解出内层 zip：名字含 `_excel` 的=数据(xlsx)、含 `resources` 的=附件(可多卷)。
// 解析：xlsx「数据」sheet 前两行为表头、第 3 行起为数据。**按表头名定位列**（不依赖列序）。
// 子表：简道云把一对多子表导成「第 1 行横向合并的组 + 第 2 行组内字段名 + 同主键多行展开」。
//   引擎读合并区间(ws.model.merges)圈出每个子表组，区间内按第 2 行字段名取值，组内每行 build 一条记录；
//   另支持「单列单元格内多值」子表(splitSubtables，如客户多个办公地址)。
// 归属：第 1 行表头须含 signature → 否则整包失败。提交人：匹配同名用户、无则建(拼音账号+bcrypt(123456))。
// 写库：业务键 upsert（已存在更新覆盖、否则新增挂 createdById=提交人）；整文件事务，任一行失败整批不写。
import { prisma } from '@/lib/prisma'
import { HttpError } from '@/lib/apiError'
import type { CurrentUser } from '@/lib/permissions'
import { pinyin } from 'pinyin-pro'
import bcrypt from 'bcryptjs'
import { promises as fs } from 'fs'
import path from 'path'

// ── 配置类型（见 jodooConfigs.ts，全部按「表头列名」声明）─────────────────────────
export interface JodooField {
  header: string
  field: string
  transform?: (raw: string) => any // 返回 undefined 视为「无法识别」→ 该行报错
  required?: boolean
}
export interface JodooAttachment {
  header: string
  field: string
}
export interface JodooCtx {
  ensureUser: (name: string) => Promise<number>
}
// 宽表展开子表：靠第 1 行横向合并区间圈定，match=区间第 2 行须含的独有字段名（认领该区间）；
// build 用 getSub(第2行字段名)→该列值 构建一条记录（返回 null 跳过）。
export interface JodooSubtable {
  relationField: string
  match: string
  build: (getSub: (h2name: string) => string, ctx: JodooCtx) => Promise<any | null>
  // 本系统导出的封存包：子表整体存在主行的一个 JSON 列里（jsonHeader），fromJson 把 JSON 对象转 record。
  jsonHeader?: string
  fromJson?: (obj: any, ctx: JodooCtx) => Promise<any | null>
}
// 单列多值子表：主行某列单元格内含多条（按 sep 拆），每条 { [field]: 段 }。
export interface JodooSplitSub {
  header: string
  relationField: string
  field: string
  sep?: RegExp
  jsonHeader?: string
  fromJson?: (obj: any, ctx: JodooCtx) => Promise<any | null>
}
export interface JodooModule {
  model: string
  label: string
  signature: string[]
  submitterHeader: string
  createdAtHeader?: string
  fields: JodooField[]
  attachments?: JodooAttachment[]
  userFields?: { header: string; field: string }[]
  subtables?: JodooSubtable[]
  splitSubtables?: JodooSplitSub[]
  groupKeyHeaders?: string[] // 子表展开行归并 key（须含「创建时间」以区分同业务键的独立记录）：同 key 多行＝主行+子表展开
  resolveScalars?: (get: (header: string) => string, scalars: any) => Promise<void>
  dedupe: (scalars: any) => any | null
}
export interface JodooResult {
  created: number
  updated: number
  failed: number
  errors: { row: number; msg: string }[]
}

// ── zip 工具 ──────────────────────────────────────────────────────────────────
const isJunk = (name: string) => name.startsWith('__MACOSX/') || name.split('/').pop()!.startsWith('._')
async function loadZip(buf: ArrayBuffer) {
  const mod: any = await import('jszip')
  const JSZip = mod.default ?? mod
  return JSZip.loadAsync(buf)
}
async function openFengcun(buf: ArrayBuffer): Promise<{ excel: ArrayBuffer; attachZips: any[] }> {
  const outer = await loadZip(buf)
  let excelInnerName: string | null = null
  const attachInnerNames: string[] = []
  for (const name of Object.keys(outer.files)) {
    if (isJunk(name) || outer.files[name].dir) continue
    const lower = name.toLowerCase()
    if (!lower.endsWith('.zip')) continue
    if (lower.includes('_excel')) excelInnerName = name
    else if (lower.includes('resources')) attachInnerNames.push(name)
  }
  if (!excelInnerName) throw new HttpError(400, '压缩包内未找到数据文件（应含一个名字带 _excel 的 zip）')
  const excelZip = await loadZip(await outer.files[excelInnerName].async('arraybuffer'))
  const xlsxName = Object.keys(excelZip.files).find((n) => !isJunk(n) && n.toLowerCase().endsWith('.xlsx'))
  if (!xlsxName) throw new HttpError(400, '数据 zip 内未找到 .xlsx')
  const excel = await excelZip.files[xlsxName].async('arraybuffer')
  const attachZips: any[] = []
  for (const n of attachInnerNames) attachZips.push(await loadZip(await outer.files[n].async('arraybuffer')))
  return { excel, attachZips }
}

// ── xlsx 解析（第 1、2 行表头 + 第 3 行起数据 + 第 1 行横向合并区间）─────────────
function cellText(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text)
    if (v.result != null) return String(v.result)
    if (v.hyperlink != null) return String(v.text ?? v.hyperlink)
    return ''
  }
  return String(v)
}
const colLetterToNum = (s: string): number => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n } // 1-based
// 第 1 行的横向合并(跨列) → 子表组列区间(0-based)
function horizontalMergeRegions(merges: any): { c0: number; c1: number }[] {
  const out: { c0: number; c1: number }[] = []
  for (const m of (Array.isArray(merges) ? merges : []) as string[]) {
    const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m)
    if (!mm) continue
    const c1 = colLetterToNum(mm[1]), r1 = +mm[2], c2 = colLetterToNum(mm[3])
    if (r1 === 1 && c2 > c1) out.push({ c0: c1 - 1, c1: c2 - 1 })
  }
  return out
}
async function parseSheet(buf: ArrayBuffer, jsonHeaders: string[] = []): Promise<{ header: string[]; header2: string[]; rows: { cols: string[]; __row: number }[]; regions: { c0: number; c1: number }[] }> {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.getWorksheet('数据') ?? wb.worksheets[0]
  if (!ws) throw new HttpError(400, 'xlsx 内无工作表')
  const colCount = ws.columnCount
  const header: string[] = []
  for (let c = 1; c <= colCount; c++) header[c - 1] = cellText(ws.getRow(1).getCell(c).value).trim()
  // 表头行数检测：本系统导出包含 JSON 子表列(如「办公地址JSON」)→单行表头、数据第 2 行起；
  // 简道云原生封存包无此列→双行表头(第 2 行为子表字段名)、数据第 3 行起。
  const singleRow = jsonHeaders.length > 0 && header.some((h) => jsonHeaders.includes(h))
  const header2: string[] = []
  if (!singleRow) for (let c = 1; c <= colCount; c++) header2[c - 1] = cellText(ws.getRow(2).getCell(c).value).trim()
  const rows: { cols: string[]; __row: number }[] = []
  for (let r = singleRow ? 2 : 3; r <= ws.rowCount; r++) {
    const cols: string[] = []
    let hasAny = false
    for (let c = 1; c <= colCount; c++) {
      const t = cellText(ws.getRow(r).getCell(c).value).trim()
      cols[c - 1] = t
      if (t) hasAny = true
    }
    if (hasAny) rows.push({ cols, __row: r })
  }
  return { header, header2, rows, regions: singleRow ? [] : horizontalMergeRegions(ws.model?.merges) }
}

// ── 附件：resources zip(可多卷) → finstId 索引 + FINST 单元格落盘 ──────────────
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads')
function buildAttachmentResolver(attachZips: any[]) {
  const index = new Map<string, { zip: any; entry: string }[]>()
  for (const z of attachZips) {
    for (const name of Object.keys(z.files)) {
      if (isJunk(name) || z.files[name].dir) continue
      const finst = name.split('/')[0]
      if (!index.has(finst)) index.set(finst, [])
      index.get(finst)!.push({ zip: z, entry: name })
    }
  }
  const cache = new Map<string, string>()
  const used = new Set<string>()
  return async (cell: string): Promise<string | null> => {
    const v = (cell || '').trim()
    if (!v.startsWith('FINST-') || !attachZips.length) return null
    const parts = v.split('/')
    const finst = parts[0]
    const entries = index.get(finst)
    if (!entries || !entries.length) return null
    const last = parts[parts.length - 1]
    const hit = (last.includes('.') && entries.find((e) => e.entry.endsWith(last))) || entries[0]
    const ckey = `${finst}/${hit.entry}`
    if (cache.has(ckey)) return cache.get(ckey)!
    // 物理落盘名＝附件真实文件名(去掉路径分隔/控制符)；同名冲突追加 (序号) 保证唯一。
    // /api/files 下载即以此真实名呈现；URL 编码以容纳中文/空格等字符。
    const base = (path.basename(hit.entry).replace(/[/\\\x00-\x1f]/g, '_').trim()) || 'file'
    let safe = base
    if (used.has(safe)) {
      const e = path.extname(base); const stem = base.slice(0, base.length - e.length)
      let i = 1; while (used.has(`${stem}(${i})${e}`)) i++
      safe = `${stem}(${i})${e}`
    }
    used.add(safe)
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, safe), Buffer.from(await hit.zip.files[hit.entry].async('arraybuffer')))
    const url = `/api/files/${encodeURIComponent(safe)}`
    cache.set(ckey, url)
    return url
  }
}

// ── 提交人：姓名 → userId（匹配或建，拼音首字母账号 + bcrypt(123456)）──────────
const stripDeparted = (s: string) => s.replace(/\s*\[已离职\]\s*/g, '').trim()
function genUsername(name: string): string {
  const han = /[一-龥]/.test(name)
  const base = han
    ? (pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }) as string[]).join('').toUpperCase().replace(/[^A-Z]/g, '')
    : name.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return base || 'U'
}
function makeEnsureUser(tx: any, fallbackId: number): JodooCtx['ensureUser'] {
  const cache = new Map<string, number>()
  return async (rawName: string): Promise<number> => {
    const name = stripDeparted(rawName)
    if (!name) return fallbackId
    if (cache.has(name)) return cache.get(name)!
    const existing = await tx.user.findFirst({ where: { name }, select: { id: true } })
    if (existing) { cache.set(name, existing.id); return existing.id }
    const passwordHash = await bcrypt.hash('123456', 10)
    const baseU = genUsername(name)
    let username = baseU
    for (let i = 2; await tx.user.findUnique({ where: { username }, select: { id: true } }); i++) username = `${baseU}${i}`
    const u = await tx.user.create({ data: { name, username, passwordHash }, select: { id: true } })
    cache.set(name, u.id)
    return u.id
  }
}
function bjDate(s: string): Date | null {
  const t = String(s ?? '').trim().replace(/\//g, '-')
  if (!t) return null
  const iso = t.includes(' ') || t.includes('T') ? t.replace(' ', 'T') + '+08:00' : t.slice(0, 10) + 'T00:00:00+08:00'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// ── 主入口 ────────────────────────────────────────────────────────────────────
export async function runFengcunImport(cfg: JodooModule, buf: ArrayBuffer, user: CurrentUser): Promise<JodooResult> {
  const { excel, attachZips } = await openFengcun(buf)
  const jsonHeaders = [...(cfg.subtables ?? []), ...(cfg.splitSubtables ?? [])].map((s) => s.jsonHeader).filter(Boolean) as string[]
  const { header, header2, rows, regions } = await parseSheet(excel, jsonHeaders)

  const missing = cfg.signature.filter((s) => !header.includes(s))
  if (missing.length) throw new HttpError(400, `该封存包不属于「${cfg.label}」模块（缺少列：${missing.join('、')}），请在对应模块导入`)

  const colOf = new Map<string, number>()
  header.forEach((h, i) => { if (h && !colOf.has(h)) colOf.set(h, i) })
  const getVal = (cols: string[], h: string): string => { const i = colOf.get(h); return i == null ? '' : (cols[i] ?? '') }

  // 子表区间 → 认领的 subtable + 区间内「第2行字段名→列号」
  const subRegions = (cfg.subtables ?? []).length
    ? regions.map((R) => {
        const h2col = new Map<string, number>()
        for (let c = R.c0; c <= R.c1; c++) { const n = header2[c]; if (n && !h2col.has(n)) h2col.set(n, c) }
        const sub = (cfg.subtables ?? []).find((s) => h2col.has(s.match))
        return sub ? { sub, h2col } : null
      }).filter(Boolean) as { sub: JodooSubtable; h2col: Map<string, number> }[]
    : []

  const resolveAttachment = buildAttachmentResolver(attachZips)

  // 分组：简道云封存包对一条主记录的主表单元格做纵向合并、子表展开成多行；exceljs 读出时把合并值
  // 填充进每个子表行，故同一记录各行的 groupKeyHeaders 取值都相同 → 拼 key 归并。
  // ⚠️ key 必须含「创建时间」：否则同客户同岗位名的多条独立记录(业务键相同、创建时间不同)会被误并成一条。
  const groups: { lead: string[]; rows: string[][]; __row: number }[] = []
  if (cfg.groupKeyHeaders?.length) {
    const idx = new Map<string, number>()
    for (const r of rows) {
      const k = cfg.groupKeyHeaders.map((h) => getVal(r.cols, h)).join('|')
      if (!idx.has(k)) { idx.set(k, groups.length); groups.push({ lead: r.cols, rows: [r.cols], __row: r.__row }) }
      else groups[idx.get(k)!].rows.push(r.cols)
    }
  } else {
    for (const r of rows) groups.push({ lead: r.cols, rows: [r.cols], __row: r.__row })
  }

  // 解析阶段：标量 + 反查
  type Op = { scalars: any; lead: string[]; rows: string[][]; row: number }
  const ops: Op[] = []
  const errors: { row: number; msg: string }[] = []
  for (const g of groups) {
    try {
      const scalars: any = {}
      for (const f of cfg.fields) {
        const raw = getVal(g.lead, f.header).trim()
        if (!raw) { if (f.required) throw new Error(`「${f.header}」必填`); continue }
        let val: any = raw
        if (f.transform) { val = f.transform(raw); if (val === undefined) throw new Error(`「${f.header}」无法识别的值：${raw}`) }
        if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) scalars[f.field] = val
      }
      if (cfg.createdAtHeader) { const d = bjDate(getVal(g.lead, cfg.createdAtHeader)); if (d) scalars.createdAt = d }
      if (cfg.resolveScalars) await cfg.resolveScalars((h) => getVal(g.lead, h), scalars)
      ops.push({ scalars, lead: g.lead, rows: g.rows, row: g.__row })
    } catch (e: any) {
      errors.push({ row: g.__row, msg: e instanceof Error ? e.message : String(e) })
    }
  }
  if (errors.length) return { created: 0, updated: 0, failed: errors.length, errors }

  // 事务：建/匹配用户 → 落附件 → 构建子表 → upsert（业务键）
  let created = 0
  let updated = 0
  await prisma.$transaction(async (tx: any) => {
    const ensureUser = makeEnsureUser(tx, user.id)
    const ctx: JodooCtx = { ensureUser }
    const m = tx[cfg.model]
    for (const op of ops) {
      const data = { ...op.scalars }
      const submitterName = getVal(op.lead, cfg.submitterHeader).trim()
      const ownerId = submitterName ? await ensureUser(submitterName) : user.id
      for (const a of cfg.attachments ?? []) {
        const url = await resolveAttachment(getVal(op.lead, a.header))
        if (url) data[a.field] = url
      }
      for (const uf of cfg.userFields ?? []) {
        const nm = getVal(op.lead, uf.header).trim()
        if (nm) data[uf.field] = await ensureUser(nm)
      }
      // 子表（宽表展开型：每个认领区间，组内每行 build 一条）
      const subData: Record<string, any[]> = {}
      for (const { sub, h2col } of subRegions) {
        const list = subData[sub.relationField] ??= []
        for (const row of op.rows) {
          const g = (name: string) => { const c = h2col.get(name); return c == null ? '' : (row[c] ?? '') }
          const rec = await sub.build(g, ctx)
          if (rec) list.push(rec)
        }
      }
      // 子表（单列多值型：主行该列拆分）
      for (const sp of cfg.splitSubtables ?? []) {
        const raw = getVal(op.lead, sp.header).trim()
        if (!raw) continue
        const list = raw.split(sp.sep ?? /[\n;；]+/).map((x) => x.trim()).filter(Boolean).map((x) => ({ [sp.field]: x }))
        if (list.length) subData[sp.relationField] = list
      }
      // 子表（JSON 列型：本系统导出的封存包，子表整体存在主行的 JSON 列里）
      const jsonSubs = [...(cfg.subtables ?? []), ...(cfg.splitSubtables ?? [])] as { jsonHeader?: string; relationField: string; fromJson?: (o: any, c: JodooCtx) => Promise<any | null> }[]
      for (const js of jsonSubs) {
        if (!js.jsonHeader || !js.fromJson) continue
        const cell = getVal(op.lead, js.jsonHeader).trim()
        if (!cell) continue
        let arrJson: any
        try { arrJson = JSON.parse(cell) } catch { continue }
        if (!Array.isArray(arrJson)) continue
        const list = (subData[js.relationField] ??= [])
        for (const obj of arrJson) { const rec = await js.fromJson(obj, ctx); if (rec) list.push(rec) }
      }

      const where = cfg.dedupe(op.scalars)
      const exist = where ? await m.findFirst({ where, select: { id: true } }) : null
      if (exist) {
        const rewrite: any = {}
        for (const [rel, list] of Object.entries(subData)) rewrite[rel] = { deleteMany: {}, create: list }
        await m.update({ where: { id: exist.id }, data: { ...data, updatedById: ownerId, ...rewrite } })
        updated++
      } else {
        const nest: any = {}
        for (const [rel, list] of Object.entries(subData)) nest[rel] = { create: list }
        await m.create({ data: { ...data, createdById: ownerId, ...nest } })
        created++
      }
    }
  }, { timeout: 120000 })

  return { created, updated, failed: 0, errors: [] }
}
