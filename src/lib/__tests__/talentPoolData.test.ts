import { describe, it, expect } from 'vitest'
import { buildTalentPoolData } from '@/lib/talentPoolData'

describe('buildTalentPoolData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除只读字段与脏字段', () => {
    const out = buildTalentPoolData({
      name: '候选人A',
      currentPosition: '工程师',
      targetPosition: '架构师',
      positionType: '技术',
      positionLevel: 'P7',
      resumeUrl: '/files/cv.pdf',
      id: 1,
      createdAt: 'x',
      updatedAt: 'y',
      _count: {},
      junk: 'drop',
    })
    expect(out.name).toBe('候选人A')
    expect(out.currentPosition).toBe('工程师')
    expect(out.targetPosition).toBe('架构师')
    expect(out.positionType).toBe('技术')
    expect(out.positionLevel).toBe('P7')
    expect(out.resumeUrl).toBe('/files/cv.pdf')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('updatedAt')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildTalentPoolData({ name: 'A', createdById: 8 })
    expect(out).not.toHaveProperty('createdById')
  })

  it('gender 枚举空串 → null，有值原样保留', () => {
    expect(buildTalentPoolData({ name: 'A', gender: '' }).gender).toBeNull()
    expect(buildTalentPoolData({ name: 'A', gender: 'MALE' }).gender).toBe('MALE')
  })

  it('数值字段 birthYear：数字字符串 → Number，空串 / 缺失 → null；age 已不是人才库字段', () => {
    expect(buildTalentPoolData({ name: 'A', birthYear: '1992' }).birthYear).toBe(1992)
    expect(buildTalentPoolData({ name: 'A', birthYear: '' }).birthYear).toBeNull()
    expect(buildTalentPoolData({ name: 'A' }).birthYear).toBeNull()
    // 年龄字段已移除(出生年份可推算)：即使前端误传 age 也被白名单过滤掉
    expect('age' in buildTalentPoolData({ name: 'A', age: 30 })).toBe(false)
  })

  it('tags：自由文本(不按逗号分隔)，整段作为单元素存入，逗号为普通字符', () => {
    expect(buildTalentPoolData({ name: 'A', tags: 'Java, Go, Rust' }).tags).toEqual(['Java, Go, Rust'])
    expect(buildTalentPoolData({ name: 'A', tags: '  核心人才  ' }).tags).toEqual(['核心人才'])
  })

  it('tags：空串 → 空数组；已是数组则原样保留', () => {
    expect(buildTalentPoolData({ name: 'A', tags: '' }).tags).toEqual([])
    expect(buildTalentPoolData({ name: 'A' }).tags).toEqual([])
    expect(buildTalentPoolData({ name: 'A', tags: ['x', 'y'] }).tags).toEqual(['x', 'y'])
  })
})
