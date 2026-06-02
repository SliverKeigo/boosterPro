import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, AUTH_COOKIE, type JwtPayload } from '@/lib/auth'

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
