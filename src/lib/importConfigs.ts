/* eslint-disable @typescript-eslint/no-explicit-any */
// 各模块的导入配置（服务端）。新增模块即在 CONFIGS 加一项：声明字段/关系/子表。
import { prisma } from '@/lib/prisma'
import type { ImportResource } from '@/lib/importServer'

// ── 关系按名称唯一反查 id：重名 → 抛错（该行报错）；查无 → 返回 null（buildRow 报「找不到匹配」）──
async function resolveUnique(model: string, where: any, label: string): Promise<number | null> {
  const found = await (prisma as any)[model].findMany({ where, select: { id: true }, take: 2 })
  if (found.length > 1) throw new Error(`${label}「${describe(where)}」重名，无法唯一匹配，请改用唯一名称`)
  return found[0]?.id ?? null
}
function describe(where: any): string {
  if (where?.OR) return where.OR.map((o: any) => Object.values(o)[0]).join('/')
  return String(Object.values(where)[0])
}

export const resolveCustomer = (name: string) =>
  resolveUnique('customer', { OR: [{ shortName: name }, { fullName: name }] }, '客户')
export const resolveRequirement = (name: string) =>
  resolveUnique('requirement', { positionName: name }, '岗位')
export const resolveUserByName = (name: string) => resolveUnique('user', { name }, '用户')

// 枚举值映射工具：未命中返回 undefined（buildRow 视为「无法识别的值」→ 该行报错）
const mapEnum = (m: Record<string, string>) => (raw: any) => m[String(raw).trim()]

const GENDER_IN = mapEnum({ 男: 'MALE', 女: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE' })

export const CONFIGS: Record<string, ImportResource> = {
  TALENT_POOL: {
    model: 'talentPool',
    fields: [
      { header: '姓名', field: 'name', required: true },
      { header: '性别', field: 'gender', transform: GENDER_IN },
      { header: '出生年月', field: 'birthYear' }, // YYYY-MM 文本
      { header: '最高学历', field: 'education' },
      { header: '联系电话', field: 'phone' },
      { header: '当前职位', field: 'currentPosition', required: true },
      { header: '意向职位', field: 'targetPosition' },
      { header: '所属行业', field: 'positionType' },
      { header: '职位级别', field: 'positionLevel' },
      { header: '人才标签', field: 'tags', type: 'string[]' },
      { header: '简历及相关资料', field: 'resumeUrl' },
    ],
  },
}
