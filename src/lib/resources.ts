// 权限系统的资源(八个业务菜单)与功能动作定义。纯常量，server / client 均可 import。

// 八个业务菜单：key=权限资源标识，label=菜单中文名，path=对应 API 路径段 / 前端路由段
export const RESOURCES = [
  { key: 'CANDIDATE', label: '候选人管理', path: 'candidates' },
  { key: 'REQUIREMENT', label: '客户需求管理', path: 'requirements' },
  { key: 'CLIENT_SUPPLEMENT', label: '客户补充信息', path: 'supplements' },
  { key: 'CUSTOMER_CONTACT', label: '客户联系人信息', path: 'customer-contacts' },
  { key: 'TALENT_POOL', label: '人才储备库', path: 'talent-pool' },
  { key: 'OPPORTUNITY', label: '商机管理', path: 'opportunities' },
  { key: 'CUSTOMER', label: '客户基本信息', path: 'clients' },
  { key: 'CONTRACT', label: '销售合同', path: 'contracts' },
  { key: 'KNOWLEDGE', label: '公司知识库', path: 'knowledge' },
  { key: 'REPORT', label: '数据报表', path: 'reports' },
  { key: 'WORK_PLAN', label: '工作计划', path: 'work-plans' },
] as const

export type ResourceKey = (typeof RESOURCES)[number]['key']

// 功能动作：页面级功能权限
export const ACTIONS = [
  { key: 'VIEW', label: '查看' },
  { key: 'CREATE', label: '新增' },
  { key: 'EDIT', label: '编辑' },
  { key: 'DELETE', label: '删除' },
  { key: 'IMPORT', label: '导入' },
  { key: 'EXPORT', label: '导出' },
] as const

export type ActionKey = (typeof ACTIONS)[number]['key']

export const RESOURCE_KEYS = RESOURCES.map((r) => r.key) as ResourceKey[]
export const ACTION_KEYS = ACTIONS.map((a) => a.key) as ActionKey[]

// 无导入/导出动作的业务资源（权限矩阵据此裁剪 IMPORT/EXPORT 列；工作计划是主从-矩阵、不走通用导入引擎）
export const NO_IO_RESOURCES: ResourceKey[] = ['WORK_PLAN']

// API 路径段 → resource key（后端 route 用 path 反查自己的 resource）
export const PATH_TO_RESOURCE: Record<string, ResourceKey> = Object.fromEntries(
  RESOURCES.map((r) => [r.path, r.key]),
) as Record<string, ResourceKey>

// ── 系统管理子模块资源 ────────────────────────────────────────────────────────
// 每个子模块独立授权（「权限设置」里按 查看/新增/编辑/删除 勾选；不含导入导出）。
// ⚠️ 提权提示：SYS_PERMISSION / SYS_USER 等授出去≈把管理员权力授出去（被授权者可改权限、
// 重置他人密码）——是否授权由管理员自行斟酌。users API 另有兜底：非 admin 不得操作
// admin 账号、不得设置 isAdmin 标志（见 users route）。
export const SYSTEM_RESOURCES = [
  { key: 'SYS_USER', label: '用户管理', path: 'settings/users' },
  { key: 'SYS_DEPARTMENT', label: '部门管理', path: 'settings/departments' },
  { key: 'SYS_GROUP', label: '组管理', path: 'settings/groups' },
  { key: 'SYS_ROLE', label: '角色管理', path: 'settings/roles' },
  { key: 'SYS_PERMISSION', label: '权限设置', path: 'settings/permissions' },
  { key: 'SYS_DATA_GRANT', label: '数据共享', path: 'settings/data-grants' },
  { key: 'SYS_DICT', label: '字典管理', path: 'settings/dictionaries' },
  { key: 'SYS_PROMPT', label: '提示词管理', path: 'settings/ai-prompts' },
] as const

export type SystemResourceKey = (typeof SYSTEM_RESOURCES)[number]['key']
// 业务资源 + 系统资源的并集类型：权限判定(hasAction/requirePermission)按此收口
export type AnyResourceKey = ResourceKey | SystemResourceKey

export const SYSTEM_RESOURCE_KEYS = SYSTEM_RESOURCES.map((r) => r.key) as SystemResourceKey[]
export const ALL_RESOURCE_KEYS: AnyResourceKey[] = [...RESOURCE_KEYS, ...SYSTEM_RESOURCE_KEYS]
// 系统资源可配动作（无导入导出，权限矩阵据此裁剪列）
export const SYSTEM_ACTION_KEYS: ActionKey[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE']

// 系统子菜单路径(settings/xx) → 资源 key（菜单显隐用，两段路径）
export const SYS_PATH_TO_RESOURCE: Record<string, SystemResourceKey> = {
  ...(Object.fromEntries(SYSTEM_RESOURCES.map((r) => [r.path, r.key])) as Record<string, SystemResourceKey>),
  // 移交日志页归「用户管理」查看权限（移交本就是用户管理功能，不单设资源）
  'settings/transfer-logs': 'SYS_USER',
}

export const RESOURCE_LABEL: Record<string, string> = Object.fromEntries(
  [...RESOURCES, ...SYSTEM_RESOURCES].map((r) => [r.key, r.label]),
)
export const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a.label]),
)
