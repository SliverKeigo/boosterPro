// 修复 public schema 下所有自增序列：重置到 max(id)+1。
// 背景：种子/导入数据若以显式 id 写入而未同步序列，新建记录会撞已用 id → P2002「数据重复」。
// 直接运行：npm run db:fix-sequences（幂等，可反复执行）；也被 seed 末尾调用以防复发。
import { Pool } from 'pg'

export const RESET_SEQUENCES_SQL = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT t.relname AS tbl, s.relname AS seq
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
    WHERE s.relkind = 'S' AND nsp.nspname = 'public'
  LOOP
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT max(id) FROM public.%I), 0) + 1, false)',
      r.seq, r.tbl
    );
  END LOOP;
END $$;
`

export async function resetSequences(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(RESET_SEQUENCES_SQL)
  } finally {
    await pool.end()
  }
}

// 仅在作为脚本被直接运行时执行（被 import 时不触发）
if (process.argv[1] && /fix-sequences\.(ts|js)$/.test(process.argv[1])) {
  resetSequences()
    .then(() => console.log('✅ 已将 public schema 所有自增序列重置到 max(id)+1'))
    .catch((e) => {
      console.error('❌ 序列重置失败：', e)
      process.exit(1)
    })
}
