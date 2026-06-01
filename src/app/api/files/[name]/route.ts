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
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
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

    // ?download=1 强制下载，否则 inline 预览
    const dl = new URL(req.url).searchParams.get('download')
    const disposition = dl ? 'attachment' : 'inline'

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(origName)}`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
