import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { aiPrompt: { findUnique: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { getPrompt, PROMPT_DEFAULTS } from '@/lib/aiPrompts'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
beforeEach(() => vi.clearAllMocks())

describe('getPrompt', () => {
  it('库有覆盖 → 用库内容并填充 {{变量}}', async () => {
    mock(prisma.aiPrompt.findUnique).mockResolvedValue({ content: '你好 {{company}}，需求：{{demand}}' })
    const out = await getPrompt('supplement_opening', { company: '腾讯', demand: '后端' })
    expect(out).toBe('你好 腾讯，需求：后端')
  })

  it('库无覆盖 → 回退代码默认值并填充', async () => {
    mock(prisma.aiPrompt.findUnique).mockResolvedValue(null)
    const out = await getPrompt('company_info', { companyName: '字节跳动' })
    expect(out).toContain('字节跳动')
    expect(out).toContain('严格只返回 JSON')
  })

  it('库抛错（无 DB）→ 回退默认，不崩', async () => {
    mock(prisma.aiPrompt.findUnique).mockRejectedValue(new Error('no db'))
    const out = await getPrompt('job_profile', { positionName: '后端', jobDescription: 'JD' })
    expect(out).toContain('后端')
    expect(out).toContain('JD')
  })

  it('缺失变量替为空串；未知 key → 空模板', async () => {
    mock(prisma.aiPrompt.findUnique).mockResolvedValue(null)
    expect(await getPrompt('company_info', {})).not.toContain('{{companyName}}')
    expect(await getPrompt('__不存在__', {})).toBe('')
  })

  it('PROMPT_DEFAULTS 含三个内置提示词', () => {
    expect(Object.keys(PROMPT_DEFAULTS)).toEqual(expect.arrayContaining(['job_profile', 'company_info', 'supplement_opening']))
  })
})
