// 一次性迁移：requirements.status 由「单值 varchar」改为「text[]（多选）」。
// 幂等：列已是数组类型(text[])则直接跳过；可反复执行。
// 数据保留：既有单值 → 一元数组；NULL / 空串 → 空数组。
// 运行：npm run db:migrate-req-status
// 注：全新库由 `prisma db push` 依 schema(String[]) 直接建为 text[]，无需本脚本；本脚本仅用于升级既有库。
import { Pool } from 'pg'

export async function migrateRequirementStatusToArray(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const pool = new Pool({ connectionString: url })
  try {
    const { rows } = await pool.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'requirements' AND column_name = 'status'`,
    )
    const dataType: string | undefined = rows[0]?.data_type
    if (!dataType) {
      console.log('未找到 requirements.status 列，跳过')
      return
    }
    if (dataType === 'ARRAY') {
      console.log('requirements.status 已是数组类型(text[])，无需迁移')
      return
    }
    console.log(`requirements.status 当前类型 = ${dataType}，开始转为 text[] …`)
    await pool.query(
      // 转成 nullable text[] 无默认，与 Prisma 对 String[] 的建表表示（如 candidates.tags）一致，
      // 避免后续 prisma db push 产生 drift。应用层 requirementData 始终写入数组、表单要求至少一项。
      `ALTER TABLE requirements
         ALTER COLUMN status DROP DEFAULT,
         ALTER COLUMN status TYPE text[]
           USING (CASE WHEN status IS NULL OR btrim(status) = '' THEN ARRAY[]::text[] ELSE ARRAY[status] END),
         ALTER COLUMN status DROP NOT NULL`,
    )
    console.log('✅ 迁移完成：requirements.status → text[]（既有单值已转为一元数组）')
  } finally {
    await pool.end()
  }
}

// 仅在作为脚本被直接运行时执行（被 import 时不触发）
if (process.argv[1] && /migrate-requirement-status-array\.(ts|js)$/.test(process.argv[1])) {
  migrateRequirementStatusToArray().catch((e) => {
    console.error('❌ 迁移失败：', e)
    process.exit(1)
  })
}
