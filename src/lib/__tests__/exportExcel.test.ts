// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportToExcel } from '@/lib/exportExcel'

// 捕获传给 createObjectURL 的 Blob，回读校验 xlsx 内容
let captured: Blob | null = null
let clickSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  captured = null
  // jsdom 无 URL.createObjectURL / revokeObjectURL，stub 之并捕获 Blob
  ;(URL as any).createObjectURL = vi.fn((blob: Blob) => {
    captured = blob
    return 'blob:x'
  })
  ;(URL as any).revokeObjectURL = vi.fn()
  // jsdom 的 a.click() 会尝试导航并告警，stub 成 no-op
  clickSpy = vi.fn()
  HTMLAnchorElement.prototype.click = clickSpy
})

afterEach(() => {
  vi.restoreAllMocks()
})

// 把捕获的 Blob 回读成 exceljs 工作簿
async function loadWorkbook() {
  expect(captured).toBeInstanceOf(Blob)
  const buf = await captured!.arrayBuffer()
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

describe('exportToExcel', () => {
  it('触发下载：createObjectURL / a.click / revokeObjectURL 均被调用', async () => {
    await exportToExcel({
      title: '测试',
      columns: [{ header: '姓名', getValue: (r) => r.name }],
      rows: [{ name: '张三' }],
    })
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    expect(captured).toBeInstanceOf(Blob)
  })

  it('表头文本与 columns[i].header 一致', async () => {
    const columns = [
      { header: '姓名', getValue: (r: any) => r.name },
      { header: '年龄', getValue: (r: any) => r.age },
      { header: '电话', getValue: (r: any) => r.phone },
    ]
    await exportToExcel({ title: '名单', columns, rows: [{ name: '张三', age: 30, phone: '13800000000' }] })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    const header = ws.getRow(1)
    columns.forEach((c, i) => {
      expect(header.getCell(i + 1).text).toBe(c.header)
    })
  })

  it('数字保持为 number 类型', async () => {
    await exportToExcel({
      title: 't',
      columns: [{ header: '年龄', getValue: (r: any) => r.age }],
      rows: [{ age: 30 }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    const cell = ws.getRow(2).getCell(1)
    expect(typeof cell.value).toBe('number')
    expect(cell.value).toBe(30)
  })

  it('ISO 日期串 → Date 单元格并带 numFmt', async () => {
    await exportToExcel({
      title: 't',
      columns: [{ header: '日期', getValue: (r: any) => r.d }],
      rows: [{ d: '2026-05-27' }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    const cell = ws.getRow(2).getCell(1)
    expect(cell.value instanceof Date).toBe(true)
    // 归一化为 yyyy-mm-dd（无时间）
    expect((cell.value as Date).getFullYear()).toBe(2026)
    expect(cell.numFmt).toBeTruthy()
    expect(cell.numFmt).toContain('yyyy')
  })

  it('手机号类字符串存为文本(string)，不是 number', async () => {
    await exportToExcel({
      title: 't',
      columns: [{ header: '电话', getValue: (r: any) => r.phone }],
      rows: [{ phone: '13800000000' }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    const cell = ws.getRow(2).getCell(1)
    expect(typeof cell.value).toBe('string')
    expect(cell.value).toBe('13800000000')
  })

  it('列宽已设置(> 0)', async () => {
    await exportToExcel({
      title: 't',
      columns: [
        { header: '姓名', getValue: (r: any) => r.name },
        { header: '一个比较长的表头用来撑开列宽', getValue: (r: any) => r.x },
      ],
      rows: [{ name: '张三', x: 'a' }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    expect(ws.getColumn(1).width).toBeGreaterThan(0)
    expect(ws.getColumn(2).width).toBeGreaterThan(0)
    // 长表头列应比短表头列更宽
    expect(ws.getColumn(2).width!).toBeGreaterThan(ws.getColumn(1).width!)
  })

  it('布尔值转「是 / 否」文本', async () => {
    await exportToExcel({
      title: 't',
      columns: [
        { header: '在职', getValue: (r: any) => r.active },
        { header: '离职', getValue: (r: any) => r.left },
      ],
      rows: [{ active: true, left: false }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    expect(ws.getRow(2).getCell(1).value).toBe('是')
    expect(ws.getRow(2).getCell(2).value).toBe('否')
  })

  it('公式注入防护：以 = + - @ 开头的文本前置单引号当作纯文本', async () => {
    await exportToExcel({
      title: 't',
      columns: [
        { header: '备注', getValue: (r: any) => r.note },
        { header: '正常', getValue: (r: any) => r.ok },
      ],
      rows: [{ note: '=HYPERLINK("http://evil")', ok: '正常文本' }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    // 危险前缀被加 ' 前缀、存为纯文本，不会被电子表格当公式执行
    expect(ws.getRow(2).getCell(1).value).toBe('\'=HYPERLINK("http://evil")')
    // 普通文本不受影响
    expect(ws.getRow(2).getCell(2).value).toBe('正常文本')
  })

  it('多行数据全部写入', async () => {
    await exportToExcel({
      title: 't',
      columns: [{ header: '姓名', getValue: (r: any) => r.name }],
      rows: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    })
    const ws = (await loadWorkbook()).getWorksheet(1)!
    // 1 表头 + 3 数据
    expect(ws.rowCount).toBe(4)
    expect(ws.getRow(2).getCell(1).text).toBe('a')
    expect(ws.getRow(4).getCell(1).text).toBe('c')
  })
})
