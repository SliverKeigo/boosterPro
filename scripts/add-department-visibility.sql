-- 部门-模块「对外可见性」黑名单表（幂等，可重复执行；dev 与生产共用）。
-- 存在一条 (department_id, resource) = 该部门该模块数据不对其他部门可见；无记录 = 默认对外可见。
-- 安全：仅新增表，不动现有数据。
CREATE TABLE IF NOT EXISTS department_hidden_resources (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  resource      VARCHAR(50) NOT NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS department_hidden_resources_department_id_resource_key
  ON department_hidden_resources(department_id, resource);
CREATE INDEX IF NOT EXISTS department_hidden_resources_resource_idx
  ON department_hidden_resources(resource);
