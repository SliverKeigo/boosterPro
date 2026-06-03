// E2E live 测试客户端：打真实运行的 dev server + 真实数据库。
// 用 admin 登录拿 cookie，后续请求带上；不 mock 任何东西。
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

// 管理员密码已改为「首次 seed 随机生成」。跑 e2e 前请用固定口令灌库：
//   SEED_RESET_ADMIN_PASSWORD=1 SEED_ADMIN_PASSWORD=Admin@123456 npm run db:seed
// 此处默认沿用 Admin@123456，可用 SEED_ADMIN_PASSWORD 覆盖以与 seed 保持一致。
const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456'

let cookie = ''

export async function login(username = 'admin', password = ADMIN_PW): Promise<string> {
  if (cookie) return cookie
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`E2E 登录失败 ${res.status}: ${await res.text()}`)
  const sc = res.headers.get('set-cookie') || ''
  const m = sc.match(/bp_token=[^;]+/)
  if (!m) throw new Error('登录响应未返回 bp_token cookie')
  cookie = m[0]
  return cookie
}

export interface ApiResult<T = any> {
  status: number
  ok: boolean
  data: T
}

// 已登录的请求封装。method/path 必填，body 可选（对象会被 JSON 序列化）。
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  await login()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, ok: res.ok, data }
}

// 未登录请求（用于验证 401 守卫）。
export async function anon<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, ok: res.ok, data }
}

// 从列表响应里取数组（兼容 {data,total} 与裸数组）。
export function listOf(r: ApiResult): any[] {
  const d = r.data
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
}

// 唯一后缀，避免唯一约束冲突 + 便于识别/清理测试数据。
export const uniq = (p: string) => `${p}_E2E_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
