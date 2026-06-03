import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Prisma 需要 Node 运行时；务必每次实时计算，不走任何缓存
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 进程启动时刻（模块加载即记录），用于上报 uptime
const startedAt = Date.now()

/**
 * 限时 DB 探活：避免数据库不可达时整个健康接口被 TCP 挂住。
 * 超时/报错都返回 false，但【不会】让健康接口失败——见下方说明。
 */
async function pingDb(timeoutMs = 2000): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), timeoutMs)),
    ])
    return true
  } catch {
    return false
  }
}

/**
 * 健康检查（liveness 存活探测）。
 *
 * 语义刻意设计为「进程能响应即 200」：
 *   - 只要 Next.js 事件循环没卡死、能把这个响应返回出去，就算「活着」→ 看门狗不重启。
 *   - DB 状态仅作观测随 body 返回（db: 'ok' | 'down'），【不影响】HTTP 状态码。
 *     原因：重启 Node 进程并不能修复一个挂掉的数据库，若 DB 一抖就重启会引发「重启风暴」。
 * 因此看门狗据「无响应 / 超时 / 5xx」判定死活，而非据 DB。
 */
export async function GET() {
  const dbOk = await pingDb()
  return NextResponse.json(
    {
      status: 'ok',
      db: dbOk ? 'ok' : 'down',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      ts: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
