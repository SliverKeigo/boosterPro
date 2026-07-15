'use client'

import { useRef, useState } from 'react'
import { Upload, FileText, Download, X, Loader2, ExternalLink } from 'lucide-react'

interface FileUploadProps {
  /** 已上传文件的 URL（/api/files/xxx），或旧的文本内容 */
  value?: string
  onChange: (url: string) => void
  accept?: string
}

function fileNameFromUrl(url: string): string {
  const raw = decodeURIComponent(url.split('/').pop() || '')
  return raw.replace(/^\d+-[a-z0-9]+-/, '')
}

// Office 文档类型 → 对应的本机 Office 协议与显示名（浏览器渲染不了 Office，点击直接调起本机程序）
const OFFICE: Record<string, { scheme: string; label: string }> = {
  doc: { scheme: 'ms-word', label: 'Word' },
  docx: { scheme: 'ms-word', label: 'Word' },
  xls: { scheme: 'ms-excel', label: 'Excel' },
  xlsx: { scheme: 'ms-excel', label: 'Excel' },
  ppt: { scheme: 'ms-powerpoint', label: 'PowerPoint' },
  pptx: { scheme: 'ms-powerpoint', label: 'PowerPoint' },
}

export function FileUpload({ value, onChange, accept }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const isUploaded = !!value && value.startsWith('/api/files/')
  const fileName = isUploaded ? fileNameFromUrl(value!) : ''
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
  const office = OFFICE[ext]

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) onChange(data.url)
    } catch {
      /* 由调用方页面的 toast 兜底，这里静默 */
    } finally {
      setUploading(false)
    }
  }

  if (isUploaded) {
    // 打开附件的两条路（不再用内嵌弹窗预览）：
    // ① Office(doc/xls/ppt)：浏览器渲染不了，用 ms-* 协议调起本机 Office。
    // ② 其余：新标签页打开，交给浏览器原生渲染——/api/files 已按格式给
    //    inline（图片 / PDF / txt → 浏览器直接预览、可缩放翻页）或 attachment
    //    （svg 防 XSS、zip 等未知格式 → 自动下载、交本机程序打开，同 Office 的道理），
    //    故前端无需再判断格式。
    const openOffice = (e: React.SyntheticEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // 绝对 URL + 文件名编码；ofe=编辑打开。需 Windows + 桌面版 Office；Mac 版 Office 不拉 http 远程文档。
      const storedName = decodeURIComponent((value!.split('?')[0] || '').split('/').pop() || '')
      window.location.href = `${office.scheme}:ofe|u|${window.location.origin}/api/files/${encodeURIComponent(storedName)}`
    }

    // 注意：只读(详情)态下，外层 Modal 会把内容包进 fieldset[disabled] + pointer-events-none，
    // 会让 <button> 失效、并拦截点击。触发器故意用 <a> + 显式 pointer-events-auto + stopPropagation
    // 豁免外层禁用，确保详情态附件仍可点开。
    const openProps: React.ComponentProps<'a'> = office
      ? {
          role: 'button',
          tabIndex: 0,
          onClick: openOffice,
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') openOffice(e)
          },
        }
      : {
          href: value,
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: (e) => e.stopPropagation(),
        }
    const openLabel = office ? `用 ${office.label} 打开` : '新标签页打开'

    return (
      <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <a
          {...openProps}
          className="flex-1 cursor-pointer truncate text-sm text-base-content hover:text-primary hover:underline [pointer-events:auto]"
          title={`${openLabel}：${fileName}`}
        >
          {fileName}
        </a>
        <a
          {...openProps}
          className="btn btn-ghost btn-xs [pointer-events:auto]"
          aria-label={openLabel}
          title={openLabel}
        >
          {office ? <FileText className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
        </a>
        <a
          href={`${value}?download=1`}
          download
          onClick={(e) => e.stopPropagation()}
          className="btn btn-ghost btn-xs [pointer-events:auto]"
          aria-label="下载"
          title="下载"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={() => onChange('')}
          className="btn btn-ghost btn-xs text-error"
          aria-label="移除"
          title="移除"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void upload(f)
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-4 text-center transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-base-300 bg-base-100 hover:border-primary/40 hover:bg-base-200/40'
        }`}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Upload className="h-5 w-5 text-base-content/40" />
        )}
        <span className="text-sm text-base-content/60">
          {uploading ? '上传中…' : '点击或拖拽文件到此处上传'}
        </span>
      </div>
      {value && !isUploaded && (
        <div className="mt-1 truncate text-xs text-base-content/40" title={value}>
          原内容：{value}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
