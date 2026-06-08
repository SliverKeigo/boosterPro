-- 功能批次 schema 迁移（幂等、事务化；本地 psql 跑，生产手工跑）
-- 涵盖：需求年薪/年龄→文本、候选人/人才库出生年份→Int(年)、候选人院校 enum→text[]、新增 data_grants 表
BEGIN;

-- 1) requirements：年薪/年龄 两端数值 → 单文本（回填后删旧列，仿 monthly_salary）
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS annual_salary VARCHAR(50);
UPDATE requirements SET annual_salary = CASE
  WHEN annual_salary_min IS NOT NULL AND annual_salary_max IS NOT NULL THEN trim_scale(annual_salary_min)::text||'-'||trim_scale(annual_salary_max)::text
  WHEN annual_salary_min IS NOT NULL THEN trim_scale(annual_salary_min)::text
  WHEN annual_salary_max IS NOT NULL THEN trim_scale(annual_salary_max)::text
  ELSE NULL END
WHERE annual_salary IS NULL AND (annual_salary_min IS NOT NULL OR annual_salary_max IS NOT NULL);
ALTER TABLE requirements DROP COLUMN IF EXISTS annual_salary_min;
ALTER TABLE requirements DROP COLUMN IF EXISTS annual_salary_max;

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS age_range VARCHAR(50);
UPDATE requirements SET age_range = CASE
  WHEN age_min IS NOT NULL AND age_max IS NOT NULL THEN age_min::text||'-'||age_max::text
  WHEN age_min IS NOT NULL THEN age_min::text
  WHEN age_max IS NOT NULL THEN age_max::text
  ELSE NULL END
WHERE age_range IS NULL AND (age_min IS NOT NULL OR age_max IS NOT NULL);
ALTER TABLE requirements DROP COLUMN IF EXISTS age_min;
ALTER TABLE requirements DROP COLUMN IF EXISTS age_max;

-- 2) 出生年份 VARCHAR(7)/YYYY-MM → INT（取前 4 位年；丢月份，已确认）
ALTER TABLE candidates ALTER COLUMN birth_year TYPE INTEGER
  USING (CASE WHEN birth_year ~ '^[0-9]{4}' THEN left(birth_year, 4)::int ELSE NULL END);
ALTER TABLE talent_pool ALTER COLUMN birth_year TYPE INTEGER
  USING (CASE WHEN birth_year ~ '^[0-9]{4}' THEN left(birth_year, 4)::int ELSE NULL END);

-- 3) candidates.school_tier：枚举单值 → text[]（单值转单元素数组，空→空数组，NOT NULL DEFAULT '{}'）
ALTER TABLE candidates ALTER COLUMN school_tier DROP DEFAULT;
ALTER TABLE candidates ALTER COLUMN school_tier TYPE text[]
  USING (CASE WHEN school_tier IS NULL THEN '{}'::text[] ELSE ARRAY[school_tier::text] END);
ALTER TABLE candidates ALTER COLUMN school_tier SET DEFAULT '{}';
ALTER TABLE candidates ALTER COLUMN school_tier SET NOT NULL;

-- 4) data_grants 表（权限共享授权；Wave E 用）
CREATE TABLE IF NOT EXISTS data_grants (
  id SERIAL PRIMARY KEY,
  resource VARCHAR(50) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_user_id INTEGER,
  source_dept_id INTEGER,
  grantee_type VARCHAR(20) NOT NULL,
  grantee_user_id INTEGER,
  grantee_dept_id INTEGER,
  access VARCHAR(10) NOT NULL,
  granted_by_id INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS data_grants_resource_idx ON data_grants(resource);
CREATE INDEX IF NOT EXISTS data_grants_src_user_idx ON data_grants(source_type, source_user_id);
CREATE INDEX IF NOT EXISTS data_grants_src_dept_idx ON data_grants(source_type, source_dept_id);
CREATE INDEX IF NOT EXISTS data_grants_grantee_user_idx ON data_grants(grantee_type, grantee_user_id);
CREATE INDEX IF NOT EXISTS data_grants_grantee_dept_idx ON data_grants(grantee_type, grantee_dept_id);

COMMIT;
