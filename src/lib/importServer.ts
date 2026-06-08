/* eslint-disable @typescript-eslint/no-explicit-any */
// 通用导入引擎（服务端）：解析 .xlsx → 按模块配置校验/解析(关系按名称反查 id、子表 JSON 解码)
// → 整文件事务 upsert(有 id 更新、无 id 新增；任一行校验失败则整批回滚、不写库)。
import { prisma } from '@/lib/prisma'
import { assertRowWritable, type CurrentUser } from '@/lib/permissions'

type FieldType = 'string' | 'number' | 'int' | 'date' | 'boolean' | 'string[]'

export interface ImportField {
  header: string // Excel 列头
  field: string // prisma 标量字段名
  type?: FieldType
  required?: boolean
  omitIfEmpty?: boolean // 空值时不写该字段（用于 NOT NULL+默认值列：新增走默认、更新不改）
  transform?: (raw: any) => any // 值映射（如 男→MALE）；返回 undefined 视为无法识别 → 该行报错
  relation?: { idField: string; resolve: (name: string) => Promise<number | null> } // 关系列：名称→id 写入 idField
}
export interface ImportSubtable {
  header: string // 子表列头（单元格存 JSON 数组）
  relationField: string // prisma 嵌套关系字段（如 guaranteeCommunications）
  fields: { key: string; type?: FieldType }[]
}
// ── 查重配置（应用层去重，与 POST/PUT 同款取键逻辑）──
// keys(scalars): 从已构建好的标量数据里取出该行的「去重键」数组（如客户=[全称,简称]去空、
//   候选人=[姓名+手机号 的展示串]），空数组表示该行不参与去重；键统一小写化用于文件内互撞比较，
//   也用作命中文案里的名字。
// findExisting(scalars, excludeId): 查库里是否已有与该行重复的记录，返回命中描述（报错文案）或 null；
//   直接用 scalars 取值查库（避免从展示串里反解），excludeId 为本行 id（更新场景排除自身）。
export interface ImportDedup {
  label: string // 该键的中文名（如「客户名称/简称」「候选人」），用于报错文案
  keys: (scalars: any) => string[]
  findExisting: (scalars: any, excludeId?: number) => Promise<string | null>
}
export interface ImportResource {
  model: string // prisma 模型 accessor（如 'talentPool'）
  fields: ImportField[]
  subtables?: ImportSubtable[]
  dedup?: ImportDedup
}
export interface ImportResult {
  created: number
  updated: number
  failed: number
  errors: { row: number; msg: string }[]
}

// ── 解析 .xlsx → 行对象数组（header→cell 值），首行为表头 ──
export async function parseWorkbook(buf: ArrayBuffer): Promise<Record<string, any>[]> {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell: any, col: number) => {
    headers[col - 1] = normHeader(String(cellText(cell.value) ?? '').trim())
  })
  const rows: Record<string, any>[] = []
  ws.eachRow((row: any, rn: number) => {
    if (rn === 1) return
    const obj: Record<string, any> = {}
    let hasAny = false
    headers.forEach((h, i) => {
      if (!h) return
      const v = cellText(row.getCell(i + 1).value)
      obj[h] = v
      if (v !== '' && v != null) hasAny = true
    })
    if (hasAny) {
      obj.__row = rn
      rows.push(obj)
    }
  })
  return rows
}

// 去掉表头末尾的「必填」标记（导出给必填列加了 * / （必填）），以便与配置里的干净表头匹配
export function normHeader(h: string): string {
  return h.replace(/\s*[*＊]$/, '').replace(/\s*[（(]\s*必填\s*[）)]$/, '').trim()
}

function cellText(v: any): any {
  if (v == null) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text) // 富文本 / 超链接
    if (v.result != null) return v.result // 公式结果
    if (v.value != null) return v.value
    return ''
  }
  return v
}

function coerce(type: FieldType | undefined, raw: any): any {
  if (raw == null || raw === '') return null
  switch (type) {
    case 'int':
    case 'number': {
      const n = Number(raw)
      if (Number.isNaN(n)) throw new Error('应为数字')
      return n
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(String(raw).replace(' ', 'T'))
      if (Number.isNaN(d.getTime())) throw new Error('日期格式不正确')
      return d
    }
    case 'boolean':
      return raw === true || raw === '是' || raw === 'true' || raw === 1 || raw === '1'
    case 'string[]':
      return String(raw).split(/[、,，;；\s]+/).filter(Boolean)
    default:
      return String(raw)
  }
}

// 解析子表单元格 → 行数组。可读文本格式：每行一条记录，字段按配置顺序用「|」分隔
// （如 "2026-01-01 | 已沟通"）。最后一个字段吸收多余的「|」，以容忍正文里出现「|」。
function parseSubtable(raw: any, st: ImportSubtable): any[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // 按前 (n-1) 个「|」切分，最后一个字段吃掉剩余（保留正文里的「|」与空格）
      const out: any = {}
      let rest = line
      st.fields.forEach((f, i) => {
        const isLast = i === st.fields.length - 1
        let val: string
        if (isLast) {
          val = rest.trim()
        } else {
          const idx = rest.indexOf('|')
          if (idx === -1) { val = rest.trim(); rest = '' }
          else { val = rest.slice(0, idx).trim(); rest = rest.slice(idx + 1) }
        }
        out[f.key] = coerce(f.type, val)
      })
      return out
    })
}

// 构建一行的写入数据（含关系解析、子表解析、id 存在性/归属校验）。出错抛 Error(带原因)。
async function buildRow(
  cfg: ImportResource,
  row: any,
  user: CurrentUser,
): Promise<{ id?: number; scalars: any; subtables: Record<string, any[]> }> {
  const scalars: any = {}
  for (const f of cfg.fields) {
    const raw = row[f.header]
    if (f.relation) {
      if (raw == null || raw === '') {
        if (f.required) throw new Error(`「${f.header}」必填`)
        scalars[f.relation.idField] = null
        continue
      }
      const id = await f.relation.resolve(String(raw).trim())
      if (id == null) throw new Error(`「${f.header}」找不到匹配项：${raw}`)
      scalars[f.relation.idField] = id
    } else {
      if (f.required && (raw == null || raw === '')) throw new Error(`「${f.header}」必填`)
      let val = raw
      if (f.transform && raw != null && raw !== '') {
        val = f.transform(raw)
        if (val === undefined) throw new Error(`「${f.header}」无法识别的值：${raw}`)
      } else {
        val = coerce(f.type, raw)
      }
      if (val === null && f.omitIfEmpty) continue // NOT NULL+默认值列：空则不写，用默认/不改
      scalars[f.field] = val
    }
  }
  const subtables: Record<string, any[]> = {}
  for (const st of cfg.subtables ?? []) subtables[st.relationField] = parseSubtable(row[st.header], st)

  const idRaw = row.id ?? row.ID
  const id = idRaw != null && String(idRaw).trim() !== '' ? Number(idRaw) : undefined
  if (id != null) {
    if (Number.isNaN(id)) throw new Error(`id 不是数字：${idRaw}`)
    const existing = await (prisma as any)[cfg.model].findUnique({ where: { id }, select: { createdById: true } })
    if (!existing) throw new Error(`id=${id} 不存在（无法更新）`)
    assertRowWritable(user, existing) // 非本人创建且非管理员 → 抛 403（计入该行错误）
  }
  return { id, scalars, subtables }
}

// 主入口：解析 .xlsx → importRows
export async function runImport(cfg: ImportResource, buf: ArrayBuffer, user: CurrentUser): Promise<ImportResult> {
  return importRows(cfg, await parseWorkbook(buf), user)
}

// 核心：全量校验（有错即整批不写）+ 事务 upsert。与 .xlsx 解析解耦，便于测试。
export async function importRows(cfg: ImportResource, rows: Record<string, any>[], user: CurrentUser): Promise<ImportResult> {
  const ops: { id?: number; scalars: any; subtables: Record<string, any[]>; row: number }[] = []
  const errors: { row: number; msg: string }[] = []
  for (const row of rows) {
    try {
      const built = await buildRow(cfg, row, user)
      ops.push({ ...built, row: row.__row })
    } catch (e: any) {
      errors.push({ row: row.__row, msg: e instanceof Error ? e.message : String(e) })
    }
  }

  // ── 查重校验（仅当解析阶段全部通过时才做，避免脏行干扰）：
  //   (a) 同一文件内多行互撞（同一去重键出现在多行）；(b) 与库内已有记录重复。命中均 push 到 errors。
  if (cfg.dedup && !errors.length) {
    const dd = cfg.dedup
    const seen = new Map<string, number>() // 小写键 → 首次出现的行号
    for (const op of ops) {
      const keys = dd.keys(op.scalars)
      if (!keys.length) continue
      // (a) 文件内互撞
      let intra = false
      for (const k of keys) {
        const lk = k.toLowerCase()
        const prev = seen.get(lk)
        if (prev != null) {
          errors.push({ row: op.row, msg: `${dd.label}「${k}」与本文件第 ${prev} 行重复` })
          intra = true
        }
      }
      // 本行的键登记（即便互撞也登记，便于后续行继续比对到最早出现行）
      for (const k of keys) {
        const lk = k.toLowerCase()
        if (!seen.has(lk)) seen.set(lk, op.row)
      }
      if (intra) continue
      // (b) 与库内已有重复（更新行排除自身 id）
      const dup = await dd.findExisting(op.scalars, op.id)
      if (dup) errors.push({ row: op.row, msg: dup })
    }
  }

  // 整文件事务：有任一行错 → 全不写
  if (errors.length) return { created: 0, updated: 0, failed: errors.length, errors }

  let created = 0
  let updated = 0
  await prisma.$transaction(async (tx: any) => {
    const m = tx[cfg.model]
    for (const op of ops) {
      const subCreate: any = {}
      for (const [rel, list] of Object.entries(op.subtables)) subCreate[rel] = { create: list }
      if (op.id != null) {
        const subRewrite: any = {}
        for (const [rel, list] of Object.entries(op.subtables)) subRewrite[rel] = { deleteMany: {}, create: list }
        await m.update({ where: { id: op.id }, data: { ...op.scalars, ...subRewrite } })
        updated++
      } else {
        await m.create({ data: { ...op.scalars, ...subCreate, createdById: user.id } })
        created++
      }
    }
  })
  return { created, updated, failed: 0, errors: [] }
}
