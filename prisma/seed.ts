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
import { INDUSTRIES, TALENT_INDUSTRIES } from '../src/lib/industries'
import { resetSequences } from './fix-sequences'

const ADMIN_EMAIL = 'admin@boosterpro.com'
const ADMIN_PASSWORD = 'Admin@123456'
const ADMIN_NAME = '系统管理员'
const ADMIN_USERNAME = 'admin'
const DEFAULT_DEPARTMENT_NAME = '总部'
const DEFAULT_ROLE_NAME = '超级管理员'

/**
 * 字典种子定义。每个类型包含 code / name / remark 与字典项 label 列表
 *（label = value，按下标顺序作为 sort）。industry 的项由 INDUSTRIES 提供。
 */
const DICT_SEEDS: { code: string; name: string; remark?: string; labels: string[] }[] = [
  { code: 'industry', name: '所属行业', labels: INDUSTRIES },
  // 人才库「所属行业」专用（与上面客户信息的 industry 是两套不同列表，均客户提供）
  { code: 'talent_industry', name: '所属行业（人才库）', labels: TALENT_INDUSTRIES },
  {
    code: 'recruitment_channel',
    name: '招聘渠道',
    labels: ['BOSS直聘', '猎聘', '脉脉', '内推', '智联招聘', '前程无忧', '其他'],
  },
  { code: 'requirement_status', name: '岗位状态', labels: ['新增', '正常', '重启', '暂停', '加急', '关闭', '售前岗位'] },
  // 客户仅提供「线索阶段」一个取值；勿臆造其它阶段，需新增由客户确认后在「字典管理」补充。
  { code: 'opportunity_status', name: '商机状态', labels: ['线索阶段'] },
  { code: 'service_type', name: '服务类型', labels: ['猎头', 'RPO', '其他'] },
  { code: 'position_level', name: '职位级别', labels: ['初级', '中级', '高级', '专家', '管理'] },
  { code: 'invoice_type', name: '发票类型', labels: ['增值税专用发票', '增值税普通发票'] },
  { code: 'verification_result', name: '核销结果', labels: ['已核销', '未核销', '部分核销'] },
  { code: 'knowledge_category', name: '知识分类', labels: ['案例分享', '行业资料', '培训资料', '知识便条', '制度流程模板'] },
  { code: 'knowledge_tag', name: '知识标签', labels: ['技术知识', '市场知识', '交付知识', '管理知识', '产品与服务知识'] },
]

/**
 * 幂等地种入字典类型与字典项：
 *   - 类型按 code upsert（更新 name/remark，不存在则创建）。
 *   - 字典项仅在「该类型当前一条都没有」时才批量插入，避免重复运行产生重复数据。
 */
async function seedDicts() {
  for (const seed of DICT_SEEDS) {
    const type = await prisma.dictType.upsert({
      where: { code: seed.code },
      update: { name: seed.name, remark: seed.remark ?? null },
      create: { code: seed.code, name: seed.name, remark: seed.remark ?? null },
    })

    const existingCount = await prisma.dictItem.count({ where: { typeId: type.id } })
    if (existingCount === 0) {
      await prisma.dictItem.createMany({
        data: seed.labels.map((label, idx) => ({
          typeId: type.id,
          label,
          value: label,
          sort: idx,
        })),
      })
    }
  }

  console.log(`Seed 完成：字典类型 ${DICT_SEEDS.length} 个（含字典项，幂等）`)
}

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
      username: ADMIN_USERNAME,
      passwordHash,
      isAdmin: true,
      departmentId: department.id,
      roleId: role.id,
    },
    create: {
      name: ADMIN_NAME,
      username: ADMIN_USERNAME,
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

  // 字典种子（幂等，置于业务账号 seed 之后）
  await seedDicts()

  // 同步所有自增序列到 max(id)+1，避免后续新建撞种子已用 id（P2002「数据重复」）
  await resetSequences()
  console.log('Seed 完成：已重置自增序列到 max(id)+1')
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
