-- 为 9 张业务主表新增「修改人」外键 updated_by_id（可空，ON DELETE SET NULL ON UPDATE CASCADE，
-- 与 Prisma 对可选关系的默认引用动作一致，避免后续 db push drift）。
-- 幂等：列与约束存在则跳过，可重复执行。dev 与生产（225）共用此脚本。
-- 安全：仅新增可空列与外键，不删列、不改类型、不影响现有数据。
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers', 'client_supplements', 'customer_contacts', 'requirements',
    'candidates', 'talent_pool', 'opportunities', 'contracts', 'knowledge_base'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by_id integer', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_updated_by_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE',
        t, t || '_updated_by_id_fkey'
      );
    END IF;
  END LOOP;
END $$;
