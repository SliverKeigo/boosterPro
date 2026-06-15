import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 权限移交审计日志列表（只读、仅追加）。归「用户管理(SYS_USER)」查看权限——
// 移交本就是用户管理功能。返回全量，前端 BoostTable 负责搜索/排序/分页。
export async function GET() {
  try {
    await requirePermission('SYS_USER', 'VIEW')
    const data = await prisma.transferLog.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ data, total: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
