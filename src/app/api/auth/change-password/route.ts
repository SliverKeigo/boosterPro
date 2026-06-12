import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { getCurrentUser } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 登录用户修改自己的密码：先校验当前密码，新密码至少 8 位。
// 仅要求登录态（middleware 拦未登录），不要求任何资源权限——人人可改自己的密码。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const { oldPassword, newPassword } = await req.json()
    if (!oldPassword || !newPassword) throw new HttpError(400, '请填写当前密码与新密码')
    if (String(newPassword).length < 8) throw new HttpError(400, '新密码至少 8 位')
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    const bcrypt = (await import('bcryptjs')).default
    if (!row?.passwordHash || !(await bcrypt.compare(String(oldPassword), row.passwordHash))) {
      throw new HttpError(400, '当前密码不正确')
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(String(newPassword), 10) },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
