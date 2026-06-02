import { describe, it, expect } from 'vitest'
import { INDUSTRIES } from '@/lib/industries'

describe('industries - INDUSTRIES 常量', () => {
  it('为非空字符串数组', () => {
    expect(Array.isArray(INDUSTRIES)).toBe(true)
    expect(INDUSTRIES.length).toBeGreaterThan(0)
    for (const item of INDUSTRIES) {
      expect(typeof item).toBe('string')
      expect(item.length).toBeGreaterThan(0)
    }
  })

  it('包含代表性行业成员', () => {
    expect(INDUSTRIES).toContain('IT/互联网/游戏')
    expect(INDUSTRIES).toContain('金融')
    expect(INDUSTRIES).toContain('医疗健康')
    expect(INDUSTRIES).toContain('其他')
  })

  it('「其他」作为兜底项排在最后', () => {
    expect(INDUSTRIES[INDUSTRIES.length - 1]).toBe('其他')
  })

  it('无重复项', () => {
    expect(new Set(INDUSTRIES).size).toBe(INDUSTRIES.length)
  })
})
