import { describe, it, expect, vi, afterEach } from 'vitest'
import { yearList, yearOptions } from '@/components/ui/YearSelect'

afterEach(() => {
  vi.useRealTimers()
})

describe('yearList - 年份数字列表', () => {
  it('范围 [minYear, 今年+maxFuture]、降序、含首尾边界', () => {
    // 固定"今年"为 2026，避免跨年脆弱。
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T00:00:00Z'))

    const list = yearList(2020, 0)
    // 2026 → 2020 共 7 个
    expect(list).toHaveLength(7)
    expect(list[0]).toBe(2026) // 含上界（今年）
    expect(list[list.length - 1]).toBe(2020) // 含下界（minYear）
    expect(list).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020])
  })

  it('maxFuture > 0 时上界为今年+maxFuture', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T00:00:00Z'))

    const list = yearList(2024, 10)
    expect(list[0]).toBe(2036) // 今年 + 10
    expect(list[list.length - 1]).toBe(2024)
    expect(list).toHaveLength(2036 - 2024 + 1)
  })

  it('严格降序排列', () => {
    const list = yearList(2000, 5)
    for (let i = 1; i < list.length; i++) {
      expect(list[i]).toBeLessThan(list[i - 1])
    }
  })

  it('不硬编码具体年份：长度 = 上界-下界+1（相对断言，跨年稳定）', () => {
    const minYear = 1990
    const maxFuture = 3
    const thisYear = new Date().getFullYear()
    const list = yearList(minYear, maxFuture)
    expect(list[0]).toBe(thisYear + maxFuture)
    expect(list[list.length - 1]).toBe(minYear)
    expect(list).toHaveLength(thisYear + maxFuture - minYear + 1)
  })

  it('默认参数：minYear=1950、maxFuture=0', () => {
    const thisYear = new Date().getFullYear()
    const list = yearList()
    expect(list[0]).toBe(thisYear)
    expect(list[list.length - 1]).toBe(1950)
    expect(list).toContain(thisYear)
    expect(list).toContain(1950)
  })
})

describe('yearOptions - 下拉选项（与 yearList 同口径）', () => {
  it('每项 { label, value } 均为对应年份的字符串', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T00:00:00Z'))

    const opts = yearOptions(2024, 0)
    expect(opts).toEqual([
      { label: '2026', value: '2026' },
      { label: '2025', value: '2025' },
      { label: '2024', value: '2024' },
    ])
  })

  it('长度与顺序同 yearList，value/label 为对应数字的字符串', () => {
    const list = yearList(2010, 2)
    const opts = yearOptions(2010, 2)
    expect(opts).toHaveLength(list.length)
    opts.forEach((opt, i) => {
      expect(opt.value).toBe(String(list[i]))
      expect(opt.label).toBe(String(list[i]))
    })
  })
})
