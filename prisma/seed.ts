/**
 * 数据库种子脚本（幂等）。
 *
 * 创建：
 *   - 默认部门「总部」
 *   - 默认角色「超级管理员」
 *   - 默认管理员账号 admin@boosterpro.com（用户名 admin，isAdmin: true）
 *     首次创建时【随机生成密码】并打印到控制台（也可用 SEED_ADMIN_PASSWORD 指定）；
 *     再次运行【不会重置】已有管理员密码（除非显式 SEED_RESET_ADMIN_PASSWORD=1）。
 *
 * 密码哈希方式与登录校验（src/app/api/auth/login/route.ts 用 bcryptjs.compare）保持一致，
 * 因此这里同样用 bcryptjs.hash。
 *
 * 数据库连接复用 src/lib/prisma.ts（@prisma/adapter-pg）。
 * 运行：npm run db:seed（需先 npx prisma db push 建好表结构，且 .env 中已设 DATABASE_URL）。
 */
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { INDUSTRIES, TALENT_INDUSTRIES } from '../src/lib/industries'
import { resetSequences } from './fix-sequences'

const ADMIN_EMAIL = 'admin@boosterpro.com'
const ADMIN_NAME = '系统管理员'
const ADMIN_USERNAME = 'admin'
const DEFAULT_DEPARTMENT_NAME = '总部'
const DEFAULT_ROLE_NAME = '超级管理员'

/** 随机强密码：A-Za-z0-9（去掉 0/O/1/l/I 等易混淆字符），用作初始管理员密码 */
function genPassword(len = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

/** 环境变量真值判断 */
function truthy(v: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes((v ?? '').trim().toLowerCase())
}

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
    labels: ['猎聘', 'BOSS', '智联', '前程无忧', '推介', '朋友群', '其他'],
  },
  { code: 'requirement_status', name: '岗位状态', labels: ['新增', '正常', '重启', '暂停', '加急', '关闭', '售前岗位'] },
  // 客户仅提供「线索阶段」一个取值；勿臆造其它阶段，需新增由客户确认后在「字典管理」补充。
  { code: 'opportunity_status', name: '商机状态', labels: ['线索阶段'] },
  { code: 'service_type', name: '服务类型', labels: ['猎头', 'RPO', '其他'] },
  { code: 'position_level', name: '职位级别', labels: ['初级', '中级', '高级'] },
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

  // 管理员（邮箱 @unique 作稳定键）。安全要点：
  //   ① 首次创建时随机生成密码（不再硬编码 Admin@123456）；
  //   ② 再次 seed【不重置】已有管理员密码——否则会把管理员改过的密码覆盖回默认值（提权风险）。
  // 忘记密码需重置时：SEED_RESET_ADMIN_PASSWORD=1 npm run db:seed（可配合 SEED_ADMIN_PASSWORD 指定）。
  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  })
  const baseData = {
    name: ADMIN_NAME,
    username: ADMIN_USERNAME,
    isAdmin: true,
    departmentId: department.id,
    roleId: role.id,
  }

  let adminPasswordPlain: string | null = null
  let adminResult: 'created' | 'reset' | 'unchanged'
  if (!existingAdmin) {
    adminPasswordPlain = process.env.SEED_ADMIN_PASSWORD?.trim() || genPassword()
    const passwordHash = await bcrypt.hash(adminPasswordPlain, 10)
    await prisma.user.create({ data: { ...baseData, email: ADMIN_EMAIL, passwordHash } })
    adminResult = 'created'
  } else if (truthy(process.env.SEED_RESET_ADMIN_PASSWORD)) {
    adminPasswordPlain = process.env.SEED_ADMIN_PASSWORD?.trim() || genPassword()
    const passwordHash = await bcrypt.hash(adminPasswordPlain, 10)
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { ...baseData, passwordHash } })
    adminResult = 'reset'
  } else {
    // 不写 passwordHash —— 保留管理员现有密码
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: baseData })
    adminResult = 'unchanged'
  }

  if (adminPasswordPlain) {
    console.log('────────────────────────────────────────────')
    console.log(` 管理员账号已${adminResult === 'created' ? '创建' : '重置密码'}`)
    console.log(`   账号：${ADMIN_USERNAME}    邮箱：${ADMIN_EMAIL}`)
    console.log(`   密码：${adminPasswordPlain}`)
    console.log(' ⚠ 此密码仅本次显示，请登录后立即修改')
    console.log('────────────────────────────────────────────')
  } else {
    console.log(
      `Seed：管理员 ${ADMIN_EMAIL} 已存在，密码保持不变（如需重置：SEED_RESET_ADMIN_PASSWORD=1 npm run db:seed）`,
    )
  }
  console.log(`Seed 完成：部门「${department.name}」/ 角色「${role.name}」`)
  // 供 deploy.sh 解析：本次是否新建/重置了管理员（决定是否在部署摘要展示初始密码）
  console.log(`SEED_ADMIN_RESULT=${adminResult}`)

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
