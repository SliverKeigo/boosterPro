import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, isSecureRequest, AUTH_COOKIE, type JwtPayload } from '@/lib/auth'

describe('auth - signToken / verifyToken', () => {
  const payload: JwtPayload = { userId: 42, name: '张三', username: 'zhangsan' }

  it('签发后再校验可还原 payload 字段', async () => {
    const token = await signToken(payload)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT: header.payload.signature

    const decoded = await verifyToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded!.userId).toBe(42)
    expect(decoded!.name).toBe('张三')
    expect(decoded!.username).toBe('zhangsan')
  })

  it('payload 中带有 jose 注入的 iat / exp 标准声明', async () => {
    const token = await signToken(payload)
    const decoded = (await verifyToken(token)) as unknown as Record<string, unknown>
    expect(typeof decoded.iat).toBe('number')
    expect(typeof decoded.exp).toBe('number')
    expect(decoded.exp as number).toBeGreaterThan(decoded.iat as number)
  })

  it('非法 token 校验返回 null', async () => {
    await expect(verifyToken('garbage.token')).resolves.toBeNull()
  })

  it('空字符串 token 校验返回 null', async () => {
    await expect(verifyToken('')).resolves.toBeNull()
  })

  it('被篡改的 token 校验返回 null', async () => {
    const token = await signToken(payload)
    const tampered = token.slice(0, -3) + 'xyz'
    await expect(verifyToken(tampered)).resolves.toBeNull()
  })

  it('AUTH_COOKIE 常量为 bp_token', () => {
    expect(AUTH_COOKIE).toBe('bp_token')
  })
})

describe('auth - isSecureRequest', () => {
  // 用 Headers 构造可控的 req.headers.get，url 仅在无 x-forwarded-proto 时回退使用
  const reqWith = (headers: Record<string, string>, url = 'http://t/api/x'): Request =>
    new Request(url, { headers })

  it('x-forwarded-proto=https → true（反代终止 TLS）', () => {
    expect(isSecureRequest(reqWith({ 'x-forwarded-proto': 'https' }))).toBe(true)
  })

  it('x-forwarded-proto 多值取首段：第一个为 https → true', () => {
    expect(isSecureRequest(reqWith({ 'x-forwarded-proto': 'https, http' }))).toBe(true)
  })

  it('x-forwarded-proto 多值取首段：第一个为 http → false', () => {
    expect(isSecureRequest(reqWith({ 'x-forwarded-proto': 'http, https' }))).toBe(false)
  })

  it('x-forwarded-proto=http → false', () => {
    expect(isSecureRequest(reqWith({ 'x-forwarded-proto': 'http' }))).toBe(false)
  })

  it('无 x-forwarded-proto：http 的 req.url → false', () => {
    expect(isSecureRequest(reqWith({}, 'http://t/api/x'))).toBe(false)
  })

  it('无 x-forwarded-proto：https 的 req.url → true', () => {
    expect(isSecureRequest(reqWith({}, 'https://t/api/x'))).toBe(true)
  })

  it('headers 缺失 / 异常 mock 不抛错，按非 HTTPS 处理（false）', () => {
    // 模拟没有 headers.get 且 url 无法解析的异常请求
    const broken = { headers: undefined, url: 'not a url' } as unknown as Request
    expect(isSecureRequest(broken)).toBe(false)
  })

  it('headers.get 抛异常时兜底返回 false（不向外抛）', () => {
    const throwing = {
      headers: {
        get() {
          throw new Error('boom')
        },
      },
      url: 'http://t/api/x',
    } as unknown as Request
    expect(isSecureRequest(throwing)).toBe(false)
  })
})
