// 权限系统的资源(八个业务菜单)与功能动作定义。纯常量，server / client 均可 import。

// 八个业务菜单：key=权限资源标识，label=菜单中文名，path=对应 API 路径段 / 前端路由段
export const RESOURCES = [
  { key: 'CANDIDATE', label: '候选人管理', path: 'candidates' },
  { key: 'REQUIREMENT', label: '客户需求管理', path: 'requirements' },
  { key: 'CLIENT_SUPPLEMENT', label: '客户补充信息', path: 'supplements' },
  { key: 'TALENT_POOL', label: '人才储备库', path: 'talent-pool' },
  { key: 'OPPORTUNITY', label: '商机管理', path: 'opportunities' },
  { key: 'CUSTOMER', label: '客户基本信息', path: 'clients' },
  { key: 'CONTRACT', label: '销售合同', path: 'contracts' },
  { key: 'KNOWLEDGE', label: '公司知识库', path: 'knowledge' },
  { key: 'REPORT', label: '数据报表', path: 'reports' },
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

// API 路径段 → resource key（后端 route 用 path 反查自己的 resource）
export const PATH_TO_RESOURCE: Record<string, ResourceKey> = Object.fromEntries(
  RESOURCES.map((r) => [r.path, r.key]),
) as Record<string, ResourceKey>

export const RESOURCE_LABEL: Record<string, string> = Object.fromEntries(
  RESOURCES.map((r) => [r.key, r.label]),
)
export const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a.label]),
)
