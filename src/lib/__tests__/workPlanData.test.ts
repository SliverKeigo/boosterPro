import { describe, it, expect } from 'vitest'
import { buildItemCreate } from '@/lib/workPlanData'

describe('buildItemCreate', () => {
  it('字符串 id/数字转换 + 是否例行寻猎 是/否→bool + 参与度空→null', () => {
    const out = buildItemCreate(
      { customerId: '3', requirementId: '4', routineHunting: '是', participation: '', positionOpenDate: '2026-02-28' },
      0,
    )
    expect(out.customerId).toBe(3)
    expect(out.requirementId).toBe(4)
    expect(out.routineHunting).toBe(true)
    expect(out.participation).toBeNull()
    expect(out.positionOpenDate).toBeInstanceOf(Date)
    expect(out.sortOrder).toBe(0)
  })

  it('routineHunting=否→false；空/无→null', () => {
    expect(buildItemCreate({ routineHunting: '否' }).routineHunting).toBe(false)
    expect(buildItemCreate({ routineHunting: '' }).routineHunting).toBeNull()
    expect(buildItemCreate({}).routineHunting).toBeNull()
  })

  it('assignments：仅保留有日期的格（稀疏存储），memberId 转数字', () => {
    const out = buildItemCreate({
      assignments: [
        { memberId: '6', planDates: '6.1、6.3' },
        { memberId: 7, planDates: '   ' }, // 空白 → 丢弃
        { memberId: 8, planDates: '' }, // 空 → 丢弃
      ],
    })
    expect(out.assignments.create).toEqual([{ memberId: 6, planDates: '6.1、6.3' }])
  })

  it('sortOrder 缺省用 index', () => {
    expect(buildItemCreate({}, 3).sortOrder).toBe(3)
    expect(buildItemCreate({ sortOrder: 5 }, 3).sortOrder).toBe(5)
  })
})
