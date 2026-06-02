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

  it('数值字段 birthYear / age：数字字符串 → Number，空串 / null / 缺失 → null', () => {
    const out = buildTalentPoolData({ name: 'A', birthYear: '1992', age: '' })
    expect(out.birthYear).toBe(1992)
    expect(out.age).toBeNull()

    expect(buildTalentPoolData({ name: 'A', age: null }).age).toBeNull()
    expect(buildTalentPoolData({ name: 'A' }).birthYear).toBeNull()
    expect(buildTalentPoolData({ name: 'A', age: 30 }).age).toBe(30)
  })

  it('tags：逗号分隔字符串 → 去空白数组（与候选人/知识库的单值包装行为不同）', () => {
    expect(buildTalentPoolData({ name: 'A', tags: 'Java, Go ,  Rust' }).tags).toEqual([
      'Java',
      'Go',
      'Rust',
    ])
  })

  it('tags：空串 → 空数组；已是数组则原样保留', () => {
    expect(buildTalentPoolData({ name: 'A', tags: '' }).tags).toEqual([])
    expect(buildTalentPoolData({ name: 'A' }).tags).toEqual([])
    expect(buildTalentPoolData({ name: 'A', tags: ['x', 'y'] }).tags).toEqual(['x', 'y'])
  })

  it('tags：逗号串中的空段被过滤', () => {
    expect(buildTalentPoolData({ name: 'A', tags: 'a,,b, ,c' }).tags).toEqual(['a', 'b', 'c'])
  })
})
