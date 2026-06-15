import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, AUTH_COOKIE } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(AUTH_COOKIE)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        department: { select: { name: true } },
        role: { select: { name: true } },
        tokenVersion: true,
      },
    })
    // 单点登录：版本号对不上＝被新登录顶下来的旧 token → 401（前端 layout 据此跳登录页）
    if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { tokenVersion: _v, ...rest } = user
    return NextResponse.json(rest)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
