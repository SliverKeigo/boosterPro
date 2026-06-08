import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, AUTH_COOKIE } from '@/lib/auth'

// 不需要认证的路径前缀（/api/health 供运维看门狗免登录探活）
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/health']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 静态资源和公开路径直接放行。
  // 公开路径用【精确匹配】而非前缀：否则 startsWith('/api/health') 会顺带放行 /api/healthZZZ、
  // /api/health/secret 等同前缀子路径，日后在这些前缀下新增路由会意外免登录暴露。
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    // 附件下载放行：本地 Office（ms-word: 协议）拉文件不带登录 cookie，故 /api/files/* 免登录。
    // ⚠️ 安全降级：附件凭 URL 即可下载（无登录校验）；靠文件名的时间戳+随机前缀作弱保护。
    pathname.startsWith('/api/files/') ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifyToken(token)
  if (!payload) {
    const res = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', req.url))
    res.cookies.set(AUTH_COOKIE, '', { maxAge: 0, path: '/' })
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
