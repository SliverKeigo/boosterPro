import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, AUTH_COOKIE } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

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

    const token = await signToken({
      userId: user.id,
      name: user.name,
      username: user.username,
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })
    return response
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
