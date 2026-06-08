'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, FileWarning, FileText } from 'lucide-react'
import { Modal } from './Modal'

interface FilePreviewProps {
  open: boolean
  /** 文件 URL，形如 /api/files/xxx */
  url: string
  /** 文件名（用于标题/下载、判断扩展名）；不传则从 url 推断 */
  fileName?: string
  onClose: () => void
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function nameFromUrl(url: string): string {
  const raw = decodeURIComponent((url.split('?')[0] || '').split('/').pop() || '')
  // 去掉 时间戳-随机- 前缀，还原原始文件名
  return raw.replace(/^\d+-[a-z0-9]+-/, '')
}

export function FilePreview({ open, url, fileName, onClose }: FilePreviewProps) {
  const name = fileName || nameFromUrl(url)
  const ext = extFromName(name)

  const isImage = IMAGE_EXTS.has(ext)
  const isPdf = ext === 'pdf'
  const isDocx = ext === 'docx'
  const isWord = ext === 'docx' || ext === 'doc' // 可用本地 Word 打开的类型

  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [wordOpening, setWordOpening] = useState(false)
  // 可预览类型(图片/pdf/docx)初始为加载中，由各自的 onLoad / fetch 完成后置 false
  const previewable = isImage || isPdf || isDocx
  const [loading, setLoading] = useState(previewable)
  const [error, setError] = useState<string | null>(null)

  // 打开/切换文件时重置加载态——用「渲染期调整状态」模式（React 官方推荐），
  // 避免在 effect 里同步 setState 触发级联渲染。
  const targetRef = useRef<string | null>(null)
  const target = open ? url : null
  if (target !== targetRef.current) {
    targetRef.current = target
    setDocxHtml(null)
    setError(null)
    setLoading(previewable)
  }

  // docx：fetch arrayBuffer → mammoth 转 HTML（仅做异步副作用，状态在回调里更新→不触发同步级联）
  useEffect(() => {
    if (!open || !isDocx) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const arrayBuffer = await res.arrayBuffer()
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml({ arrayBuffer })
        if (!cancelled) {
          setDocxHtml(result.value || '<p class="text-base-content/50">（空文档）</p>')
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError('文档解析失败，请尝试下载后查看')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, isDocx, url])

  const downloadHref = `${url}${url.includes('?') ? '&' : '?'}download=1`

  // 用本机 Microsoft Word 只读打开（ms-word:ofv 协议）。
  // 本地 Word 不带浏览器登录 cookie，故先向后端换取短时效免登录 token，
  // 再拼成绝对 URL 交给 ms-word: 协议拉取；需客户端已装桌面版 Word。
  const openInWord = async () => {
    setWordOpening(true)
    try {
      const storedName = decodeURIComponent((url.split('?')[0] || '').split('/').pop() || '')
      const res = await fetch(`/api/files/sign?name=${encodeURIComponent(storedName)}`)
      if (!res.ok) throw new Error('sign failed')
      const { token } = await res.json()
      const sep = url.includes('?') ? '&' : '?'
      const absolute = `${window.location.origin}${url}${sep}t=${encodeURIComponent(token)}`
      window.location.href = `ms-word:ofv|u|${absolute}`
    } catch {
      alert('调起本地 Word 失败，请重试或改用「下载」。')
    } finally {
      setWordOpening(false)
    }
  }

  // 不渲染时直接返回 null；并用 portal 把 Modal 挂到 body，
  // 以逃离详情态外层 fieldset[disabled] 的 pointer-events-none（否则预览弹窗自身点不动）。
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <Modal open={open} onClose={onClose} width={960} footer={null} title={name || '附件预览'}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end gap-2">
          {isWord && (
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1.5"
              onClick={openInWord}
              disabled={wordOpening}
              title="用本机 Microsoft Word 只读打开（需已安装桌面版 Word）"
            >
              {wordOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              用本地 Word 打开
            </button>
          )}
          <a href={downloadHref} className="btn btn-ghost btn-sm gap-1.5" download>
            <Download className="h-4 w-4" />
            下载
          </a>
        </div>

        <div className="relative min-h-[200px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-100/60">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          )}

          {error ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-base-content/60">
              <FileWarning className="h-8 w-8 text-warning" />
              <p className="text-sm">{error}</p>
              <a href={downloadHref} className="btn btn-primary btn-sm mt-1" download>
                下载文件
              </a>
            </div>
          ) : isImage ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={name}
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false)
                  setError('图片加载失败')
                }}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={url}
              title={name}
              className="h-[72vh] w-full rounded-lg border border-base-300"
              onLoad={() => setLoading(false)}
            />
          ) : isDocx ? (
            docxHtml != null ? (
              <div
                className={[
                  'max-w-none rounded-lg border border-base-300 bg-base-100 p-5 text-sm leading-relaxed text-base-content',
                  // 项目未装 @tailwindcss/typography，用子选择器给 mammoth 输出的 HTML 补基础排版
                  '[&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-bold',
                  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold',
                  '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold',
                  '[&_p]:my-2',
                  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
                  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
                  '[&_li]:my-1',
                  '[&_a]:text-primary [&_a]:underline',
                  '[&_strong]:font-semibold',
                  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
                  '[&_td]:border [&_td]:border-base-300 [&_td]:px-2 [&_td]:py-1',
                  '[&_th]:border [&_th]:border-base-300 [&_th]:bg-base-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
                  '[&_img]:my-2 [&_img]:max-w-full',
                ].join(' ')}
                // mammoth 输出的是受信任的 docx 转换 HTML
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            ) : (
              // 加载中占位（loading 覆盖层已显示 spinner）
              <div className="min-h-[200px]" />
            )
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-base-content/60">
              <FileWarning className="h-8 w-8 text-base-content/30" />
              <p className="text-sm">该格式不支持预览</p>
              <a href={downloadHref} className="btn btn-primary btn-sm mt-1" download>
                下载文件
              </a>
            </div>
          )}
        </div>
      </div>
    </Modal>,
    document.body,
  )
}
