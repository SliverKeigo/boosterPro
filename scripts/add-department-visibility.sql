-- 部门-模块「定向可见性」黑名单（三元：源部门 × 模块 × 目标部门）。
-- 一条 (department_id 源, resource, hidden_from_dept_id 目标) = 源部门该模块数据不给目标部门看。
-- 无记录 = 默认对所有部门可见。该表为可见性配置（无业务数据），drop 重建安全。dev 与生产共用。
DROP TABLE IF EXISTS department_hidden_resources;
CREATE TABLE department_hidden_resources (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  resource            VARCHAR(50) NOT NULL,
  hidden_from_dept_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX dhr_src_resource_target_key
  ON department_hidden_resources(department_id, resource, hidden_from_dept_id);
CREATE INDEX dhr_resource_target_idx
  ON department_hidden_resources(resource, hidden_from_dept_id);
