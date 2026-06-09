import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

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
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    // 注意：附件接口已在 middleware 放行（免登录），以便本地 Office 经 ms-word: 协议拉取。
    // ⚠️ 安全降级：附件凭 URL 可下载、不做登录校验（内网部署 + 文件名随机前缀作弱保护）。
    const { name } = await params
    const decoded = decodeURIComponent(name)
    // 防目录穿越（必须保留，否则可读 uploads 外的任意文件）
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
    const INLINE_SAFE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'])
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
