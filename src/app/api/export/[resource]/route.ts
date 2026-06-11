import { handleApiError, HttpError } from '@/lib/apiError'
import { requirePermission } from '@/lib/permissions'
import { runExport, exportSupported } from '@/lib/jodooExport'
import type { ResourceKey } from '@/lib/resources'

// 封存包导出端点：/api/export/<RESOURCE_KEY>，返回与导入对称的封存包 zip（数据 + 附件）。
export const maxDuration = 300

export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params
    if (!exportSupported(resource)) throw new HttpError(400, `该模块暂不支持封存包导出：${resource}`)
    await requirePermission(resource as ResourceKey, 'EXPORT')
    const { buffer, filename } = await runExport(resource)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
