import { describe, it, expect } from 'vitest'
import { buildKnowledgeData, KNOWLEDGE_INCLUDE } from '@/lib/knowledgeData'

describe('knowledgeData - INCLUDE 常量', () => {
  it('KNOWLEDGE_INCLUDE 为对象且含 managementRecords 嵌套', () => {
    expect(typeof KNOWLEDGE_INCLUDE).toBe('object')
    expect(KNOWLEDGE_INCLUDE.managementRecords).toBeDefined()
    expect(KNOWLEDGE_INCLUDE.managementRecords.include).toBeDefined()
  })

  it('KNOWLEDGE_INCLUDE 含 internalLecturer 关联（仅 select id/name）', () => {
    expect(KNOWLEDGE_INCLUDE.internalLecturer).toBeDefined()
    expect(KNOWLEDGE_INCLUDE.internalLecturer.select).toMatchObject({ id: true, name: true })
  })
})

describe('buildKnowledgeData - 字段映射与清洗', () => {
  it('保留白名单标量字段，剔除只读字段与脏字段', () => {
    const out = buildKnowledgeData(
      {
        category: '行业知识',
        keywords: '招聘,猎头',
        fileUrl: '/files/x.pdf',
        notes: '说明',
        id: 1,
        createdAt: 'x',
        updatedAt: 'y',
        _count: {},
        junk: true,
      },
      'create',
    )
    expect(out.category).toBe('行业知识')
    expect(out.keywords).toBe('招聘,猎头')
    expect(out.fileUrl).toBe('/files/x.pdf')
    expect(out.notes).toBe('说明')
    expect(out).not.toHaveProperty('id')
    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('_count')
    expect(out).not.toHaveProperty('junk')
  })

  it('不设置 createdById', () => {
    const out = buildKnowledgeData({ category: 'A', createdById: 2 }, 'create')
    expect(out).not.toHaveProperty('createdById')
  })

  it('tags：非数组真值包装为单元素数组，假值为空数组', () => {
    expect(buildKnowledgeData({ tags: 'x' }, 'create').tags).toEqual(['x'])
    expect(buildKnowledgeData({ tags: '' }, 'create').tags).toEqual([])
    expect(buildKnowledgeData({ tags: ['a', 'b'] }, 'create').tags).toEqual(['a', 'b'])
    expect(buildKnowledgeData({}, 'create').tags).toEqual([])
  })

  it('保留 trainingOutline / externalLecturer / internalLecturerId 白名单字段', () => {
    const out = buildKnowledgeData(
      {
        category: 'A',
        trainingOutline: '第一章 概述\n第二章 实操',
        externalLecturer: '外部李老师',
        internalLecturerId: '5',
      },
      'create',
    )
    expect(out.trainingOutline).toBe('第一章 概述\n第二章 实操')
    expect(out.externalLecturer).toBe('外部李老师')
    expect(out.internalLecturerId).toBe(5)
  })

  it('trainingOutline / externalLecturer：空串 → null', () => {
    const out = buildKnowledgeData(
      { category: 'A', trainingOutline: '', externalLecturer: '' },
      'create',
    )
    expect(out.trainingOutline).toBeNull()
    expect(out.externalLecturer).toBeNull()
  })

  it('trainingOutline / externalLecturer：缺失 → null', () => {
    const out = buildKnowledgeData({ category: 'A' }, 'create')
    expect(out.trainingOutline).toBeNull()
    expect(out.externalLecturer).toBeNull()
  })

  it('internalLecturerId：数字字符串 → Number；空串 / 缺失 / null → null', () => {
    expect(buildKnowledgeData({ internalLecturerId: '9' }, 'create').internalLecturerId).toBe(9)
    expect(buildKnowledgeData({ internalLecturerId: 9 }, 'create').internalLecturerId).toBe(9)
    expect(buildKnowledgeData({ internalLecturerId: '' }, 'create').internalLecturerId).toBeNull()
    expect(buildKnowledgeData({}, 'create').internalLecturerId).toBeNull()
    expect(buildKnowledgeData({ internalLecturerId: null }, 'create').internalLecturerId).toBeNull()
  })

  it('剔除 internalLecturer relation 对象（仅保留外键 id）', () => {
    const out = buildKnowledgeData(
      { category: 'A', internalLecturer: { id: 5, name: '李老师' }, internalLecturerId: '5' },
      'create',
    )
    expect(out).not.toHaveProperty('internalLecturer')
    expect(out.internalLecturerId).toBe(5)
  })

  it('create：managementRecords 过滤空记录、转换 date / submitterId', () => {
    const out = buildKnowledgeData(
      {
        category: 'A',
        managementRecords: [
          { date: '2024-03-01', submitterId: '7', details: '细则1' },
          { date: '', submitterId: '', details: '' }, // 过滤
          { details: '只有细则' }, // date→null, submitterId→null
        ],
      },
      'create',
    )
    expect(out.managementRecords.create).toHaveLength(2)
    expect(out.managementRecords.create[0].date).toBeInstanceOf(Date)
    expect(out.managementRecords.create[0].submitterId).toBe(7)
    expect(out.managementRecords.create[0].details).toBe('细则1')
    expect(out.managementRecords.create[1]).toEqual({
      date: null,
      submitterId: null,
      details: '只有细则',
    })
  })

  it('update：managementRecords 先 deleteMany 再 create', () => {
    const out = buildKnowledgeData(
      { category: 'A', managementRecords: [{ details: 'x' }] },
      'update',
    )
    expect(out.managementRecords.deleteMany).toEqual({})
    expect(out.managementRecords.create).toHaveLength(1)
  })
})
