import { describe, it, expect } from 'vitest'
import { buildItemCreate } from '@/lib/workPlanData'

describe('buildItemCreate', () => {
  it('字符串 id/数字转换 + 来源组 groupId + 是否例行寻猎 是/否→bool + 参与度空→null', () => {
    const out = buildItemCreate(
      { groupId: '2', customerId: '3', requirementId: '4', routineHunting: '是', participation: '', positionOpenDate: '2026-02-28' },
      0,
    )
    expect(out.groupId).toBe(2)
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

  it('assignments：planDates 接受 string[] → 存 JSON 数组字符串（去重升序）；空数组/空串丢弃（稀疏）', () => {
    const out = buildItemCreate({
      assignments: [
        { memberId: '6', planDates: ['2026-06-03', '2026-06-01', '2026-06-01'] }, // 去重 + 升序
        { memberId: 7, planDates: [] }, // 空数组 → 丢弃
        { memberId: 8, planDates: '' }, // 空串 → 丢弃
      ],
    })
    expect(out.assignments.create).toEqual([{ memberId: 6, planDates: '["2026-06-01","2026-06-03"]' }])
  })

  it('assignments：兼容历史自由文本（顿号/逗号拆分为多项）', () => {
    const out = buildItemCreate({ assignments: [{ memberId: 9, planDates: '6.3、6.1' }] })
    expect(out.assignments.create).toEqual([{ memberId: 9, planDates: '["6.1","6.3"]' }])
  })

  it('sortOrder 缺省用 index', () => {
    expect(buildItemCreate({}, 3).sortOrder).toBe(3)
    expect(buildItemCreate({ sortOrder: 5 }, 3).sortOrder).toBe(5)
  })
})
