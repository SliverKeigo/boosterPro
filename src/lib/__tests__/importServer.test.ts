import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    talentPool: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
  return { prisma }
})
vi.mock('@/lib/permissions', () => ({ assertRowWritable: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { assertRowWritable } from '@/lib/permissions'
import { importRows } from '@/lib/importServer'
import { CONFIGS } from '@/lib/importConfigs'

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const user = { id: 7, isAdmin: false } as any
const TP = CONFIGS.TALENT_POOL
const run = (rows: any[]) => importRows(TP, rows, user)

beforeEach(() => vi.clearAllMocks())

describe('importRows —— 人才储备库', () => {
  it('无 id → 新增：性别男→MALE、标签拆数组、写 createdById', async () => {
    mock(prisma.talentPool.create).mockResolvedValue({ id: 1 })
    const res = await run([{ __row: 2, 姓名: '张三', 性别: '男', 当前职位: '工程师', 人才标签: 'Go、云原生' }])
    expect(res).toEqual({ created: 1, updated: 0, failed: 0, errors: [] })
    const data = mock(prisma.talentPool.create).mock.calls[0][0].data
    expect(data).toMatchObject({ name: '张三', gender: 'MALE', currentPosition: '工程师', tags: ['Go', '云原生'], createdById: 7 })
  })

  it('有 id → 更新：findUnique + assertRowWritable + update', async () => {
    mock(prisma.talentPool.findUnique).mockResolvedValue({ createdById: 7 })
    mock(prisma.talentPool.update).mockResolvedValue({ id: 5 })
    const res = await run([{ __row: 2, id: 5, 姓名: '李四', 当前职位: 'PM' }])
    expect(res).toMatchObject({ created: 0, updated: 1, failed: 0 })
    expect(assertRowWritable).toHaveBeenCalled()
    expect(mock(prisma.talentPool.update).mock.calls[0][0].where).toEqual({ id: 5 })
  })

  it('缺必填（姓名空）→ 整批不写', async () => {
    const res = await run([{ __row: 2, 姓名: '', 当前职位: 'X' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0]).toMatchObject({ row: 2 })
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('性别无法识别 → 该行报错、整批不写', async () => {
    const res = await run([{ __row: 3, 姓名: '王五', 性别: '外星人', 当前职位: 'X' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('性别')
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('一对一错 → 整文件事务全不写（含正确行）', async () => {
    const res = await run([
      { __row: 2, 姓名: '对的', 当前职位: 'A' },
      { __row: 3, 姓名: '', 当前职位: 'B' }, // 错
    ])
    expect(res.failed).toBe(1)
    expect(res.created).toBe(0)
    expect(prisma.talentPool.create).not.toHaveBeenCalled()
  })

  it('id 不存在 → 报错，不更新', async () => {
    mock(prisma.talentPool.findUnique).mockResolvedValue(null)
    const res = await run([{ __row: 2, id: 999, 姓名: 'X', 当前职位: 'Y' }])
    expect(res.failed).toBe(1)
    expect(res.errors[0].msg).toContain('999')
    expect(prisma.talentPool.update).not.toHaveBeenCalled()
  })
})
