import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { getCurrentUser } from '@/lib/permissions'
import { runWorkPlanImport } from '@/lib/workPlanImport'

// 工作计划专用导入：扁平表(每行=明细行) → 按周计划聚合重建三层。每个计划按其组做组长守卫(在 runWorkPlanImport 内)。
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new HttpError(401, '未登录或登录已过期')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, '请上传 .xlsx 文件')
    const result = await runWorkPlanImport(await file.arrayBuffer(), user)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
