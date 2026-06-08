'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, FileWarning } from 'lucide-react'
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
  // Word 文档不在此网页预览：由 FileUpload 直接经 ms-word: 协议调起本机 Word。
  // 其余非图片/PDF 类型走「下载」。
  const previewable = isImage || isPdf

  const [loading, setLoading] = useState(previewable)
  const [error, setError] = useState<string | null>(null)

  // 打开/切换文件时重置加载态——用「渲染期调整状态」模式（React 官方推荐），
  // 避免在 effect 里同步 setState 触发级联渲染。
  const targetRef = useRef<string | null>(null)
  const target = open ? url : null
  if (target !== targetRef.current) {
    targetRef.current = target
    setError(null)
    setLoading(previewable)
  }

  const downloadHref = `${url}${url.includes('?') ? '&' : '?'}download=1`

  // 不渲染时直接返回 null；并用 portal 把 Modal 挂到 body，
  // 以逃离详情态外层 fieldset[disabled] 的 pointer-events-none（否则预览弹窗自身点不动）。
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <Modal open={open} onClose={onClose} width={960} footer={null} title={name || '附件预览'}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end gap-2">
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
