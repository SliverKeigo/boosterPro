import { describe, it, expect, beforeAll } from 'vitest'
import { login } from './_client'

// 真实打 dev server：multipart 上传 + 下载回读字节。
// _client.api() 会强制 JSON content-type，不适合 multipart，故用裸 fetch 带 cookie。
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'
const CONTENT = 'e2e-content'

describe('E2E upload + files 上传/下载', () => {
  let cookie = ''
  // 上传路由返回 { url: '/api/files/<encoded>', name, size }
  let savedUrl = ''

  beforeAll(async () => {
    cookie = await login()
  })

  it('匿名上传被拦截 (401)', async () => {
    const fd = new FormData()
    fd.append(
      'file',
      new File([new TextEncoder().encode(CONTENT)], 'e2e-test.txt', { type: 'text/plain' }),
    )
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd })
    expect(res.status).toBe(401)
  })

  it('登录上传 .txt → 200 且返回 url/name', async () => {
    const fd = new FormData()
    fd.append(
      'file',
      new File([new TextEncoder().encode(CONTENT)], 'e2e-test.txt', { type: 'text/plain' }),
    )
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie }, body: fd })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.url).toBe('string')
    expect(json.url).toContain('/api/files/')
    expect(json.name).toBe('e2e-test.txt')
    expect(json.size).toBe(new TextEncoder().encode(CONTENT).length)
    savedUrl = json.url
  })

  it('上传无文件字段 → 400', async () => {
    const fd = new FormData()
    fd.append('notfile', 'x')
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie }, body: fd })
    expect(res.status).toBe(400)
  })

  it('上传被拒类型 (.html) → 400', async () => {
    const fd = new FormData()
    fd.append(
      'file',
      new File([new TextEncoder().encode('<b>x</b>')], 'evil.html', { type: 'text/html' }),
    )
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie }, body: fd })
    expect(res.status).toBe(400)
  })

  it('下载已上传文件 → 200 且字节匹配', async () => {
    expect(savedUrl).toBeTruthy()
    const res = await fetch(`${BASE}${savedUrl}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe(CONTENT)
    // 路由按扩展名给 text/plain，并禁止 MIME 嗅探
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('匿名下载被拦截 (401)', async () => {
    expect(savedUrl).toBeTruthy()
    const res = await fetch(`${BASE}${savedUrl}`)
    expect(res.status).toBe(401)
  })

  it('下载不存在文件 → 404', async () => {
    const res = await fetch(`${BASE}/api/files/does-not-exist-${Date.now()}.txt`, {
      headers: { cookie },
    })
    expect(res.status).toBe(404)
  })

  it('目录穿越被拒 (400)', async () => {
    // 用编码后的 ../ 试探目录穿越；路由 decode 后应识别 .. 并 400
    const res = await fetch(`${BASE}/api/files/${encodeURIComponent('../package.json')}`, {
      headers: { cookie },
    })
    expect(res.status).toBe(400)
  })
})
