/* eslint-disable @typescript-eslint/no-explicit-any */
// 通用「导出 Excel(.xlsx)」：表头加底色加粗、列宽按内容自适应、单元格按类型(日期/数字/文本)、冻结表头。
// exceljs 体积较大，动态 import，仅在点击导出时加载，不计入主包。

export interface ExportColumn {
  header: string
  getValue: (row: any) => any
}

// 形如 2026-05-27 或 2026-05-27 15:06 / 2026-05-27T15:06:00 的日期(时间)串
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/

// 估算列宽：中文/全角按 2，其余按 1
function strWidth(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1
  return w
}

// 归一化单元格值与类型，返回 { value, numFmt? }
function normalize(raw: any): { value: any; numFmt?: string } {
  if (raw == null || raw === '') return { value: '' }
  if (raw instanceof Date) return { value: raw, numFmt: 'yyyy-mm-dd' }
  if (typeof raw === 'number') return { value: raw }
  if (typeof raw === 'boolean') return { value: raw ? '是' : '否' }
  if (Array.isArray(raw)) return { value: raw.join('、') }
  const s = String(raw)
  // 日期/时间串 → Date，让 Excel 正确识别为日期
  if (ISO_DATE_RE.test(s)) {
    const d = new Date(s.replace(' ', 'T'))
    if (!isNaN(d.getTime())) {
      const hasTime = /[ T]\d{2}:\d{2}/.test(s)
      return { value: d, numFmt: hasTime ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd' }
    }
  }
  // 其余一律按文本：避免手机号 / 编号被转成科学计数或丢前导零
  return { value: s }
}

function sheetName(title?: string): string {
  return (title || 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Sheet1'
}

export async function exportToExcel(opts: {
  title?: string
  columns: ExportColumn[]
  rows: any[]
}): Promise<void> {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName(opts.title))

  const thin = { style: 'thin' as const, color: { argb: 'FFE0E0E0' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  // 预先归一化整张表，供单元格与列宽复用
  const matrix = opts.rows.map((row) => opts.columns.map((c) => normalize(c.getValue(row))))

  // 表头
  ws.addRow(opts.columns.map((c) => c.header))
  const headerRow = ws.getRow(1)
  headerRow.height = 24
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = border
  })

  // 数据行
  for (const cells of matrix) {
    const r = ws.addRow(cells.map((c) => c.value))
    r.height = 20
    r.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: false }
      const nf = cells[colNum - 1]?.numFmt
      if (nf) cell.numFmt = nf
    })
  }

  // 列宽：按 表头 + 内容 最大显示宽度自适应，范围 [8, 50]
  opts.columns.forEach((c, i) => {
    let max = strWidth(c.header)
    for (const cells of matrix) {
      const cell = cells[i]
      const text = cell.value instanceof Date ? '0000-00-00 00:00' : String(cell.value ?? '')
      const w = strWidth(text)
      if (w > max) max = w
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 8), 50)
  })

  // 冻结表头
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.title || 'export'}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
