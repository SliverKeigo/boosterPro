import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { CONFIGS } from '@/lib/importConfigs'
import { runImport } from '@/lib/importServer'
import type { ResourceKey } from '@/lib/resources'

// 通用导入端点：/api/import/<RESOURCE_KEY>，上传 .xlsx(FormData field "file")，按模块配置 upsert。
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const cfg = CONFIGS[resource]
    if (!cfg) throw new HttpError(400, `该模块暂不支持导入：${resource}`)
    // 鉴权：对该资源需有 IMPORT 权限（管理员放行）
    const user = await requirePermission(resource as ResourceKey, 'IMPORT')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, '请上传 .xlsx 文件')
    const buf = await file.arrayBuffer()
    const result = await runImport(cfg, buf, user)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
