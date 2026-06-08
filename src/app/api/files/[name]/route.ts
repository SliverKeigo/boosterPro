import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { getSessionPayload } from '@/lib/permissions'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    // 接口级登录校验（不只依赖 middleware）：未登录禁止下载任何文件
    if (!(await getSessionPayload())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { name } = await params
    const decoded = decodeURIComponent(name)
    // 防目录穿越
    if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const dir = path.resolve(process.cwd(), UPLOAD_DIR)
    const filePath = path.join(dir, decoded)
    await stat(filePath)
    const buf = await readFile(filePath)

    // 还原原始文件名（去掉 时间戳-随机- 前缀）
    const origName = decoded.replace(/^\d+-[a-z0-9]+-/, '')
    const ext = path.extname(decoded).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'

    // 位图图片/PDF/文本/Word 允许 inline；其余强制下载；并禁止浏览器 MIME 嗅探。
    // 注意：.svg 故意不在白名单里——直接访问其 URL 时仍走 attachment 下载，
    // 避免被当作可执行文档渲染（存储型 XSS）；应用内 <img> 预览不受 disposition 影响仍可正常显示。
    const INLINE_SAFE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf', '.txt', '.doc', '.docx'])
    const dl = new URL(req.url).searchParams.get('download')
    const disposition = !dl && INLINE_SAFE.has(ext) ? 'inline' : 'attachment'

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(origName)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
