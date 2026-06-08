-- ============================================================================
-- 225 生产库结构升级：当前基线 → d4b1560
-- 基线核查(只读)：225 缺 groups/work_plan_items/work_plan_assignments/ai_prompts；
--   work_plans 为旧单层结构且 0 行；users 无 group_id；customers.address 仍 NOT NULL；
--   requirements 仍 monthly_salary_min/max；candidates.birth_year 仍 int。
--   requirements.status 已是 text[]（无需迁移）；35 处 timestamptz/timestamp 差异为历史遗留、
--   Prisma 适配器两者都可读，本次不动。
-- 安全：整体包在事务里(PostgreSQL DDL 事务化)，任一句失败则全部回滚；执行前已 pg_dump 全库备份。
-- 回滚：从备份 pg_restore；或对照本脚本逆操作。
-- ============================================================================
BEGIN;

-- 1) 「组」表 + users.group_id ---------------------------------------------
CREATE TABLE IF NOT EXISTS "groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "department_id" INTEGER NOT NULL,
    "leader_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "groups_department_id_idx" ON "groups"("department_id");
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "group_id" INTEGER;
DO $$ BEGIN ALTER TABLE "groups" ADD CONSTRAINT "groups_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "groups" ADD CONSTRAINT "groups_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) 重建 work_plans 为三层（旧单层 0 行，安全重建）-------------------------
DROP TABLE IF EXISTS "work_plan_assignments" CASCADE;
DROP TABLE IF EXISTS "work_plan_items" CASCADE;
DROP TABLE IF EXISTS "work_plans" CASCADE;
CREATE TABLE "work_plans" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "delivery_strategy" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_plans_group_id_idx" ON "work_plans"("group_id");
CREATE INDEX "work_plans_created_by_id_idx" ON "work_plans"("created_by_id");
CREATE TABLE "work_plan_items" (
    "id" SERIAL NOT NULL,
    "work_plan_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "requirement_id" INTEGER,
    "progress_note" TEXT,
    "position_open_date" DATE,
    "routine_hunting" BOOLEAN,
    "participation" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "work_plan_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_plan_items_work_plan_id_idx" ON "work_plan_items"("work_plan_id");
CREATE TABLE "work_plan_assignments" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "plan_dates" VARCHAR(100),
    CONSTRAINT "work_plan_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_plan_assignments_item_id_member_id_key" ON "work_plan_assignments"("item_id", "member_id");
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_work_plan_id_fkey" FOREIGN KEY ("work_plan_id") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_plan_assignments" ADD CONSTRAINT "work_plan_assignments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "work_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_plan_assignments" ADD CONSTRAINT "work_plan_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) 提示词表 -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_prompts" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompts_key_key" ON "ai_prompts"("key");

-- 4) 月薪范围：两列 Int → 单列文本（先回填后删，保数据）----------------------
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "monthly_salary" VARCHAR(50);
UPDATE "requirements" SET "monthly_salary" = CASE
  WHEN monthly_salary_min IS NOT NULL AND monthly_salary_max IS NOT NULL THEN monthly_salary_min||'-'||monthly_salary_max
  WHEN monthly_salary_min IS NOT NULL THEN monthly_salary_min::text
  WHEN monthly_salary_max IS NOT NULL THEN monthly_salary_max::text
  ELSE NULL END
WHERE "monthly_salary" IS NULL;
ALTER TABLE "requirements" DROP COLUMN IF EXISTS "monthly_salary_min";
ALTER TABLE "requirements" DROP COLUMN IF EXISTS "monthly_salary_max";

-- 5) 候选人出生年份：Int → VARCHAR(7) 年-月（旧年份补 -01，保数据）-----------
ALTER TABLE "candidates" ALTER COLUMN "birth_year" TYPE VARCHAR(7)
  USING (CASE WHEN birth_year IS NULL THEN NULL ELSE lpad(birth_year::text,4,'0')||'-01' END);

-- 6) 客户「公司地址」字段弃用（破坏性：丢弃已有 address 文本；已全库备份兜底）---
ALTER TABLE "customers" DROP COLUMN IF EXISTS "address";

COMMIT;
