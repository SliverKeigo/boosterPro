import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getCurrentUser, requireAdmin } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// 分级返回（避免信息泄露）：
// - 管理员：全量字段（不返回 passwordHash），供用户管理 / 权限设置页使用，前端 BoostTable 负责搜索 / 排序 / 分页。
// - 普通登录用户：仅 { id, name }，供业务页（如候选人页提交人 / 负责人下拉）使用。
// 返回结构统一为 { data, total }，前端均消费 json.data。
export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 })

    if (me.isAdmin) {
      const data = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        omit: { passwordHash: true },
        include: {
          department: true,
          role: true,
        },
      })
      return NextResponse.json({ data, total: data.length })
    }

    const data = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, departmentId: true },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { name, email, password, departmentId, roleId } = body
    if (!name) return NextResponse.json({ error: '用户名不能为空' }, { status: 400 })
    if (!email) return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 })
    if (!password) return NextResponse.json({ error: '密码不能为空' }, { status: 400 })

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        departmentId: departmentId ? parseInt(departmentId) : null,
        roleId: roleId ? parseInt(roleId) : null,
      },
      omit: { passwordHash: true },
      include: {
        department: true,
        role: true,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
