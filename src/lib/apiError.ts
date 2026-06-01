/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'

// 常见 Prisma 已知错误码 → 可读中文提示 + 合适状态码
const PRISMA_MESSAGES: Record<string, { msg: string; status: number }> = {
  P2002: { msg: '数据重复：存在唯一约束冲突', status: 409 },
  P2003: { msg: '存在关联数据，无法删除或修改（请先处理相关联的记录）', status: 409 },
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
  console.error(e)

  const code = prismaCode(e)
  if (code && PRISMA_MESSAGES[code]) {
    const { msg, status } = PRISMA_MESSAGES[code]
    return NextResponse.json({ error: msg, code }, { status })
  }

  const message = e instanceof Error ? e.message : String(e)
  const isDev = process.env.NODE_ENV !== 'production'
  return NextResponse.json({ error: isDev ? message : '服务器内部错误' }, { status: 500 })
}
