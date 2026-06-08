import { NextResponse } from 'next/server'
import { getSessionPayload } from '@/lib/permissions'
import { signFileToken } from '@/lib/auth'

// 为本地 Office 程序（ms-word: 协议）签发短时效文件访问 token。
// 仅登录用户可签；token 绑定具体文件名、10 分钟过期（见 signFileToken）。
// 前端拿到 token 后拼成 `ms-word:ofv|u|<origin>/api/files/<name>?t=<token>` 调起本地 Word。
export async function GET(req: Request) {
  if (!(await getSessionPayload())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const name = new URL(req.url).searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }
  const decoded = decodeURIComponent(name)
  // 防目录穿越：token 只应签给 uploads 下的单层文件名
  if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  const token = await signFileToken(decoded)
  return NextResponse.json({ token })
}
