import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, AUTH_COOKIE, isSecureRequest } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { username, password, remember = true } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        passwordHash: true,
        department: { select: { name: true } },
      },
    })

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 })
    }

    const bcrypt = (await import('bcryptjs')).default
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 })
    }

    // 单点登录：登录成功即 tokenVersion +1，使该用户此前在其它设备签发的 token 全部失效（新踢旧）
    const { tokenVersion } = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    })
    const token = await signToken({
      userId: user.id,
      name: user.name,
      username: user.username,
      tokenVersion,
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        department: user.department?.name,
      },
    })
    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      // 按请求实际协议决定，而非 NODE_ENV：内网 HTTP 部署(生产)不能加 Secure，否则 cookie 被浏览器丢弃
      secure: isSecureRequest(req),
      sameSite: 'lax',
      path: '/',
      // 记住我：7 天持久 cookie；不勾选则为会话 cookie（关闭浏览器即登出）
      ...(remember ? { maxAge: 7 * 24 * 60 * 60 } : {}),
    })
    return response
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
