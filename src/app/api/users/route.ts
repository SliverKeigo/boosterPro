import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// 返回全量数据，前端 BoostTable 负责搜索 / 排序 / 分页（不返回 passwordHash）
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        department: true,
        role: true,
      },
    })
    const data = users.map(({ passwordHash, ...rest }) => {
      void passwordHash
      return rest
    })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
      include: {
        department: true,
        role: true,
      },
    })

    const { passwordHash, ...userWithoutPassword } = user
    return NextResponse.json(userWithoutPassword, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
