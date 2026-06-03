import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/health/route'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('DB 正常 → 200，db=ok，含 uptime/ts', async () => {
    mock(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', db: 'ok' })
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.ts).toBe('string')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('DB 异常 → 仍 200（存活语义），db=down，避免数据库抖动触发重启风暴', async () => {
    mock(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', db: 'down' })
  })
})
