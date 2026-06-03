import { describe, it, expect } from 'vitest'
import {
  RESOURCES,
  ACTIONS,
  RESOURCE_KEYS,
  ACTION_KEYS,
  PATH_TO_RESOURCE,
  RESOURCE_LABEL,
  ACTION_LABEL,
} from '@/lib/resources'

describe('resources 常量', () => {
  it('10 个资源、6 个动作', () => {
    expect(RESOURCES).toHaveLength(10)
    expect(ACTIONS).toHaveLength(6)
  })

  it('PATH_TO_RESOURCE 路径段 → 资源 key', () => {
    expect(PATH_TO_RESOURCE['candidates']).toBe('CANDIDATE')
    expect(PATH_TO_RESOURCE['talent-pool']).toBe('TALENT_POOL')
    expect(PATH_TO_RESOURCE['reports']).toBe('REPORT')
    expect(PATH_TO_RESOURCE['customer-contacts']).toBe('CUSTOMER_CONTACT')
    expect(Object.keys(PATH_TO_RESOURCE)).toHaveLength(10)
  })

  it('派生的 key 数组', () => {
    expect(RESOURCE_KEYS).toContain('KNOWLEDGE')
    expect(RESOURCE_KEYS).toContain('CUSTOMER_CONTACT')
    expect(RESOURCE_KEYS).toHaveLength(10)
    expect(ACTION_KEYS).toEqual(['VIEW', 'CREATE', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT'])
  })

  it('label 映射', () => {
    expect(RESOURCE_LABEL['CANDIDATE']).toBe('候选人管理')
    expect(ACTION_LABEL['EXPORT']).toBe('导出')
  })
})
