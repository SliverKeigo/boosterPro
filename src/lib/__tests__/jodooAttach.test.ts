import { describe, it, expect, vi } from 'vitest'

// 避免 import 链触发真实 prisma 连接 / 真实文件落盘
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>()
  return { ...actual, promises: { ...actual.promises, mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) } }
})

import { buildAttachmentResolver } from '@/lib/jodooImport'

// 伪造 jszip 的 attachZip 结构：z.files[name].{dir, async()}
const mkZip = (names: string[]) => ({
  files: Object.fromEntries(names.map((n) => [n, { dir: false, async: () => Promise.resolve(Buffer.from('x')) }])),
})

describe('封存包附件解析：一个 FINST 字段挂多文件', () => {
  it('字段级引用(末段无扩展名，如「备注」) → 落盘该 FINST 下全部文件，不再只取第一个', async () => {
    const zip = mkZip([
      'FINST-X/附件/备注/a.pdf',
      'FINST-X/附件/备注/b.jpg',
      'FINST-X/附件/备注/c.png',
    ])
    const resolve = buildAttachmentResolver([zip])

    // 字段级引用 → 3 个文件全部落盘（修复点：旧逻辑只返回 1 个）
    const all = await resolve('FINST-X/附件/备注')
    expect(all.length).toBe(3)
    expect(all.every((u) => u.startsWith('/api/files/'))).toBe(true)

    // 指向具体文件(末段含扩展名) → 仅该 1 个
    const one = await resolve('FINST-X/附件/备注/b.jpg')
    expect(one.length).toBe(1)
    expect(decodeURIComponent(one[0])).toContain('b.jpg')

    // 非 FINST → 空数组
    expect(await resolve('某些普通文本')).toEqual([])
    expect(await resolve('')).toEqual([])
  })

  it('多个 FINST(各挂多文件) 累加', async () => {
    const zip = mkZip([
      'FINST-A/附件/备注/1.pdf',
      'FINST-A/附件/备注/2.pdf',
      'FINST-B/附件/资料/3.docx',
    ])
    const resolve = buildAttachmentResolver([zip])
    expect((await resolve('FINST-A/附件/备注')).length).toBe(2)
    expect((await resolve('FINST-B/附件/资料')).length).toBe(1)
    // 不存在的 FINST → 空
    expect(await resolve('FINST-NONE/x')).toEqual([])
  })
})
