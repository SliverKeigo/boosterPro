/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'

// 业务层可主动抛出的带状态码错误（如 401 未登录 / 403 无权限 / 404 不存在），
// 由 handleApiError 统一转成对应响应，避免在每个 route 里手写 return。
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

// 常见 Prisma 已知错误码 → 可读中文提示 + 合适状态码
const PRISMA_MESSAGES: Record<string, { msg: string; status: number }> = {
  P2000: { msg: '字段值超出长度限制', status: 400 },
  P2002: { msg: '数据重复：存在唯一约束冲突', status: 409 },
  P2003: { msg: '存在关联数据，无法删除或修改（请先处理相关联的记录）', status: 409 },
  P2011: { msg: '缺少必填字段（存在非空约束）', status: 400 },
  P2012: { msg: '缺少必填字段', status: 400 },
  P2025: { msg: '记录不存在或已被删除', status: 404 },
}

function prismaCode(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as any).code
    if (typeof code === 'string' && /^P\d{4}$/.test(code)) return code
  }
  return null
}

/**
 * 统一 API 错误处理：
 * - 始终把真实错误写进服务端日志（console.error），不吞错
 * - Prisma 已知错误返回可读中文提示与对应状态码
 * - 其余错误：开发环境返回真实 message 便于排查，生产环境返回通用提示
 */
export function handleApiError(e: unknown) {
  // 业务主动抛出的 HttpError：用其状态码与消息（4xx 属正常业务流，不污染错误日志）
  if (e instanceof HttpError) {
    if (e.status >= 500) console.error(e)
    return NextResponse.json({ error: e.message }, { status: e.status })
  }

  console.error(e)

  const code = prismaCode(e)
  if (code && PRISMA_MESSAGES[code]) {
    const { msg, status } = PRISMA_MESSAGES[code]
    // P2000 超长：附上具体字段名，便于定位是哪个字段超限
    const col = code === 'P2000' ? (e as any)?.meta?.column_name : null
    const full = typeof col === 'string' && col ? `${msg}（字段：${col}）` : msg
    return NextResponse.json({ error: full, code }, { status })
  }

  // Prisma 校验错误（字段类型/缺失/非法枚举等）属客户端入参问题 → 400，且不外泄内部细节
  if (e instanceof Error && e.name === 'PrismaClientValidationError') {
    return NextResponse.json({ error: '请求参数有误：请检查必填项与字段格式' }, { status: 400 })
  }

  const message = e instanceof Error ? e.message : String(e)
  const isDev = process.env.NODE_ENV !== 'production'
  return NextResponse.json({ error: isDev ? message : '服务器内部错误' }, { status: 500 })
}
