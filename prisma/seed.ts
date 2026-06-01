/**
 * 数据库种子脚本（幂等）。
 *
 * 创建：
 *   - 默认部门「总部」
 *   - 默认角色「超级管理员」
 *   - 默认管理员账号 admin@boosterpro.com / Admin@123456（isAdmin: true）
 *
 * 密码哈希方式与登录校验（src/app/api/auth/login/route.ts 用 bcryptjs.compare）保持一致，
 * 因此这里同样用 bcryptjs.hash。
 *
 * 数据库连接复用 src/lib/prisma.ts（@prisma/adapter-pg）。
 * 运行：npm run db:seed（需先 npx prisma db push 建好表结构，且 .env 中已设 DATABASE_URL）。
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const ADMIN_EMAIL = 'admin@boosterpro.com'
const ADMIN_PASSWORD = 'Admin@123456'
const ADMIN_NAME = '系统管理员'
const DEFAULT_DEPARTMENT_NAME = '总部'
const DEFAULT_ROLE_NAME = '超级管理员'

async function main() {
  // 角色名是 @unique，可直接 upsert
  const role = await prisma.role.upsert({
    where: { name: DEFAULT_ROLE_NAME },
    update: {},
    create: { name: DEFAULT_ROLE_NAME, description: '系统内置最高权限角色' },
  })

  // 部门名不是 @unique，用 findFirst + create 保证幂等
  let department = await prisma.department.findFirst({
    where: { name: DEFAULT_DEPARTMENT_NAME },
  })
  if (!department) {
    department = await prisma.department.create({
      data: { name: DEFAULT_DEPARTMENT_NAME },
    })
  }

  // 邮箱是 @unique，可作为 upsert 的稳定键
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      isAdmin: true,
      departmentId: department.id,
      roleId: role.id,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      isAdmin: true,
      departmentId: department.id,
      roleId: role.id,
    },
  })

  console.log(
    `Seed 完成：管理员 ${admin.email}（id=${admin.id}）/ 部门「${department.name}」/ 角色「${role.name}」`,
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('Seed 失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
