import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('hello')),
  stat: vi.fn(async () => ({})),
}))

import { readFile, stat } from 'fs/promises'
import { GET } from '@/app/api/files/[name]/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const ctx = (name: string) => ({ params: Promise.resolve({ name }) })
const get = (name: string, query = '') =>
  GET(new Request('http://t/api/files/' + name + query), ctx(name))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/files/[name]', () => {
  it('存在的图片 → 返回字节 + inline + nosniff', async () => {
    mock(readFile).mockResolvedValue(Buffer.from('imgbytes'))
    const res = await get('1700000000-abc123-头像.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Disposition')).toContain('inline')
    // 文件名前缀被剥离还原
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('头像.png'))
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.toString()).toBe('imgbytes')
  })

  it('免登录放行（附件接口已在 middleware 放行，供 ms-word 协议拉取）', async () => {
    mock(readFile).mockResolvedValue(Buffer.from('imgbytes'))
    const res = await get('1700000000-abc123-头像.png')
    expect(res.status).toBe(200)
  })

  it('?download=1 → 强制 attachment', async () => {
    const res = await get('1700000000-abc123-a.png', '?download=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('Word 文档（docx）→ inline + 正确 mime', async () => {
    const res = await get('1700000000-abc123-合同.docx')
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml')
    expect(res.headers.get('Content-Disposition')).toContain('inline')
  })

  it('非 inline 类型（xlsx）→ attachment', async () => {
    const res = await get('1700000000-abc123-报表.xlsx')
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('目录穿越路径 → 400', async () => {
    const res = await get(encodeURIComponent('../secret.txt'))
    expect(res.status).toBe(400)
    expect(stat).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('文件不存在（stat 抛错）→ 404', async () => {
    mock(stat).mockRejectedValueOnce(new Error('ENOENT'))
    const res = await get('1700000000-abc123-missing.png')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Not found' })
  })
})
