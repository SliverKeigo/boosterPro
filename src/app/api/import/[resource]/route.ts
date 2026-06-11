import { NextResponse } from 'next/server'
import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { JODOO_MODULES } from '@/lib/jodooConfigs'
import { runFengcunImport } from '@/lib/jodooImport'
import type { ResourceKey } from '@/lib/resources'

// 通用导入端点：/api/import/<RESOURCE_KEY>，上传简道云「封存包」(.zip，FormData "file")。
// 外层 zip 内含 _excel(数据) 与 resources(附件) 两个内层 zip；按当前模块字段解析、整批事务 upsert。
// 附件大包解压 + 落盘较慢，放宽超时。
export const maxDuration = 300

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    const cfg = JODOO_MODULES[resource as ResourceKey]
    if (!cfg) throw new HttpError(400, `该模块暂不支持封存包导入：${resource}`)
    // 鉴权：对该资源需有 IMPORT 权限（管理员放行）
    const user = await requirePermission(resource as ResourceKey, 'IMPORT')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, '请上传封存包（.zip）')
    const result = await runFengcunImport(cfg, await file.arrayBuffer(), user)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
