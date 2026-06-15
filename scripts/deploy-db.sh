#!/bin/bash
# 225 生产库：备份 → 迁移 → 验证。set -e：任一步失败即停，不带病继续。
set -e
DBURL=$(grep -E '^DATABASE_URL=' /root/boosterPro/.env | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
echo "DB = $(echo "$DBURL" | sed 's#://[^@]*@#://***@#')"

BK=/root/booster_pro_db.backup.$(date +%Y%m%d_%H%M%S).sql
echo "=== ① 备份 → $BK ==="
pg_dump "$DBURL" > "$BK"
ls -lh "$BK"
test -s "$BK" || { echo "备份为空，中止"; exit 1; }

echo "=== ② 迁移 feature-batch-schema.sql（事务化）==="
psql "$DBURL" -v ON_ERROR_STOP=1 -f /root/feature-batch-schema.sql

echo "=== ③ 迁移 add-updated-by.sql ==="
psql "$DBURL" -v ON_ERROR_STOP=1 -f /root/add-updated-by.sql

echo "=== ④ 验证 ==="
echo "-- requirements 新文本列："
psql "$DBURL" -tAc "select column_name from information_schema.columns where table_name='requirements' and column_name in ('annual_salary','age_range') order by 1;"
echo "-- 旧数值列应已删除（期望空）："
psql "$DBURL" -tAc "select column_name from information_schema.columns where table_name='requirements' and column_name in ('annual_salary_min','annual_salary_max','age_min','age_max');"
echo "-- data_grants 表："
psql "$DBURL" -tAc "select to_regclass('public.data_grants');"
echo "-- updated_by_id 列（应 9 张表）："
psql "$DBURL" -tAc "select count(*) from information_schema.columns where column_name='updated_by_id';"
echo "=== DB 迁移全部完成 ==="
