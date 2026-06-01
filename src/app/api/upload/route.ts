import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// 上传目录可通过环境变量配置，默认项目根下 uploads/
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: '未收到文件' }, { status: 400 })
    }

    // 扩展名白名单：拒绝可执行 / 可在浏览器执行脚本的危险类型（.html/.svg/.js/.exe 等）
    const ALLOWED_EXT = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv', '.md', '.zip', '.rar', '.7z',
    ])
    const fileExt = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXT.has(fileExt)) {
      return NextResponse.json(
        { error: `不支持的文件类型：${fileExt || '未知'}` },
        { status: 400 },
      )
    }

    const dir = path.resolve(process.cwd(), UPLOAD_DIR)
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    // 清理文件名（保留中文/字母/数字/点/横线），加时间戳 + 随机前缀避免冲突
    const safe = file.name.replace(/[^\w.\-一-龥]/g, '_')
    const savedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
    await writeFile(path.join(dir, savedName), buffer)

    return NextResponse.json({
      url: `/api/files/${encodeURIComponent(savedName)}`,
      name: file.name,
      size: file.size,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '上传失败' }, { status: 500 })
  }
}
