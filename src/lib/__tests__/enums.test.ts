import { describe, it, expect } from 'vitest'
import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVEL_OPTIONS,
  SCHOOL_TIER_LABELS,
  SCHOOL_TIER_OPTIONS,
  GENDER_TYPE_LABELS,
  GENDER_TYPE_OPTIONS,
  RECOMMENDATION_STATUS_LABELS,
  RECOMMENDATION_STATUS_OPTIONS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_OPTIONS,
  OPPORTUNITY_NATURE_LABELS,
  OPPORTUNITY_NATURE_OPTIONS,
  type EnumOption,
} from '@/lib/enums'

describe('enums - LABELS 映射', () => {
  it('学历 label 含代表性英文 key', () => {
    expect(EDUCATION_LEVEL_LABELS.BACHELOR).toBe('本科')
    expect(EDUCATION_LEVEL_LABELS.MASTER).toBe('硕士')
    expect(EDUCATION_LEVEL_LABELS.DOCTOR).toBe('博士')
    expect(Object.keys(EDUCATION_LEVEL_LABELS).length).toBe(5)
  })

  it('院校层次 label', () => {
    expect(SCHOOL_TIER_LABELS.T985_211).toBe('985/211')
    expect(SCHOOL_TIER_LABELS.OVERSEAS).toBe('海外留学')
  })

  it('性别 label', () => {
    expect(GENDER_TYPE_LABELS.MALE).toBe('男')
    expect(GENDER_TYPE_LABELS.FEMALE).toBe('女')
    expect(GENDER_TYPE_LABELS.ANY).toBe('不限')
  })

  it('推荐状态 label 非空且含代表性成员', () => {
    expect(Object.keys(RECOMMENDATION_STATUS_LABELS).length).toBeGreaterThan(5)
    expect(RECOMMENDATION_STATUS_LABELS.PENDING).toBe('已推荐，待反馈')
    expect(RECOMMENDATION_STATUS_LABELS.INTERVIEWING).toBe('面试中')
    expect(RECOMMENDATION_STATUS_LABELS.OFFERING).toBe('Offer中')
  })

  it('商机状态 / 性质 label', () => {
    expect(OPPORTUNITY_STATUS_LABELS.LEAD).toBe('线索阶段')
    expect(OPPORTUNITY_STATUS_LABELS.CLOSED_WON).toBe('成交')
    expect(OPPORTUNITY_NATURE_LABELS.DIRECT).toBe('直接客户')
    expect(OPPORTUNITY_NATURE_LABELS.INDIRECT).toBe('间接客户')
  })
})

describe('enums - OPTIONS 由 LABELS 派生', () => {
  const cases: Array<[string, EnumOption[], Record<string, string>]> = [
    ['EDUCATION_LEVEL', EDUCATION_LEVEL_OPTIONS, EDUCATION_LEVEL_LABELS],
    ['SCHOOL_TIER', SCHOOL_TIER_OPTIONS, SCHOOL_TIER_LABELS],
    ['GENDER_TYPE', GENDER_TYPE_OPTIONS, GENDER_TYPE_LABELS],
    ['RECOMMENDATION_STATUS', RECOMMENDATION_STATUS_OPTIONS, RECOMMENDATION_STATUS_LABELS],
    ['OPPORTUNITY_STATUS', OPPORTUNITY_STATUS_OPTIONS, OPPORTUNITY_STATUS_LABELS],
    ['OPPORTUNITY_NATURE', OPPORTUNITY_NATURE_OPTIONS, OPPORTUNITY_NATURE_LABELS],
  ]

  it.each(cases)('%s_OPTIONS 与 LABELS 一一对应且保持声明顺序', (_name, options, labels) => {
    const entries = Object.entries(labels)
    expect(options).toHaveLength(entries.length)
    options.forEach((opt, i) => {
      expect(opt).toHaveProperty('value')
      expect(opt).toHaveProperty('label')
      expect(opt.value).toBe(entries[i][0])
      expect(opt.label).toBe(entries[i][1])
    })
  })

  it('每个 option 的 value 都能在 LABELS 里回查到 label', () => {
    for (const opt of OPPORTUNITY_STATUS_OPTIONS) {
      expect(OPPORTUNITY_STATUS_LABELS[opt.value]).toBe(opt.label)
    }
  })
})
