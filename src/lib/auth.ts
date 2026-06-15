import { SignJWT, jwtVerify } from 'jose'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量未配置，请在 .env 中设置后再启动')
}
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

export interface JwtPayload {
  userId: number
  name: string
  username: string
  // 单点登录：签发时写入库中 user.tokenVersion，getCurrentUser 比对；新登录使该值 +1，
  // 旧 token 版本号对不上即失效。可选——兼容升级前签发的旧 token（视为版本 0）。
  tokenVersion?: number
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}

export const AUTH_COOKIE = 'bp_token'

// 判断请求是否经 HTTPS（含被反代终止 TLS 的场景，优先看 x-forwarded-proto）。
// 用于决定登录 cookie 是否加 Secure——内网部署常是明文 HTTP 且非 localhost，
// 若强加 Secure，浏览器会丢弃该 cookie，导致登录后请求不带 token、被中间件打回登录页。
export function isSecureRequest(req: Request): boolean {
  try {
    const xfproto = req.headers?.get?.('x-forwarded-proto')
    if (xfproto) return xfproto.split(',')[0].trim().toLowerCase() === 'https'
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false // 取不到协议（如测试 mock / 异常）时按非 HTTPS 处理，不加 Secure
  }
}
