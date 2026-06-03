import { describe, it, expect, vi, beforeEach } from 'vitest'

// 文件系统副作用全部 mock 掉，只验证编排逻辑
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}))
// 上传接口现要求登录：mock 轻量登录校验为已登录
vi.mock('@/lib/permissions', () => ({
  getSessionPayload: vi.fn(async () => ({ userId: 1 })),
}))

import { writeFile, mkdir } from 'fs/promises'
import { getSessionPayload } from '@/lib/permissions'
import { POST } from '@/app/api/upload/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const upload = (file: File | null) => {
  const fd = new FormData()
  if (file) fd.set('file', file)
  return POST(new Request('http://t/api/upload', { method: 'POST', body: fd }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/upload', () => {
  it('合法图片 → 返回 url/name/size 并写盘', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], '头像.png', { type: 'image/png' })
    const res = await upload(file)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('头像.png')
    expect(body.size).toBe(3)
    expect(body.url).toMatch(/^\/api\/files\//)
    expect(mkdir).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledTimes(1)
    // 写入的文件名带时间戳-随机- 前缀且清理后保留中文扩展名
    const savedPath = mock(writeFile).mock.calls[0][0] as string
    expect(savedPath).toMatch(/\d+-[a-z0-9]+-头像\.png$/)
  })

  it('未登录 → 401，不写盘', async () => {
    mock(getSessionPayload).mockResolvedValueOnce(null)
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    const res = await upload(file)
    expect(res.status).toBe(401)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('未收到文件 → 400', async () => {
    const res = await upload(null)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: '未收到文件' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('不支持的扩展名 → 400', async () => {
    const file = new File(['<script>'], 'evil.html', { type: 'text/html' })
    const res = await upload(file)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('不支持的文件类型')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('写盘抛错 → 500', async () => {
    mock(writeFile).mockRejectedValueOnce(new Error('disk full'))
    const file = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const res = await upload(file)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: '上传失败' })
  })
})
