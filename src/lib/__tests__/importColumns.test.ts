import { describe, it, expect } from 'vitest'
import { IMPORT_COLUMNS, REQUIRED_HEADERS, markRequired } from '@/lib/importColumns'

describe('REQUIRED_HEADERS 与导出列一致', () => {
  it('每个资源的必填表头都存在于该资源的导出列中（否则 * 不会生效）', () => {
    for (const [res, reqs] of Object.entries(REQUIRED_HEADERS)) {
      const headers = new Set((IMPORT_COLUMNS[res] ?? []).map((c) => c.header))
      for (const h of reqs) {
        expect(headers.has(h), `${res} 的必填表头「${h}」不在导出列中`).toBe(true)
      }
    }
  })

  it('markRequired 给必填表头加 *、非必填不变', () => {
    expect(markRequired('CANDIDATE', '姓名')).toBe('姓名*')
    expect(markRequired('CANDIDATE', '邮箱')).toBe('邮箱*')
    expect(markRequired('CANDIDATE', '面试进展')).toBe('面试进展')
    expect(markRequired(undefined, '姓名')).toBe('姓名')
  })
})
