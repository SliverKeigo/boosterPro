import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页（不返回 passwordHash）
export async function GET() {
  try {
    const data = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      omit: { passwordHash: true },
      include: {
        department: true,
        role: true,
      },
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
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
