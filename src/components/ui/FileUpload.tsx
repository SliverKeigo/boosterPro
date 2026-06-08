'use client'

import { useRef, useState } from 'react'
import { Upload, FileText, Download, X, Loader2, Eye } from 'lucide-react'
import { FilePreview } from './FilePreview'

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

export function FileUpload({ value, onChange, accept }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const isUploaded = !!value && value.startsWith('/api/files/')
  const fileName = isUploaded ? fileNameFromUrl(value!) : ''
  // Word 文件点「预览」直接调起本机 Word（ms-word: 协议），不走网页预览
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
  const isWord = ext === 'doc' || ext === 'docx'

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
    // 注意：只读(详情)态下，外层 Modal 会把内容包进 fieldset[disabled] + pointer-events-none，
    // 会让 <button> 失效、并拦截点击。预览触发器故意用 <a>/role=button 的可点击元素，
    // 并显式加 pointer-events-auto + stopPropagation 以豁免外层禁用，确保详情态附件可点开预览。
    const openPreview = (e: React.SyntheticEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (isWord) {
        // Word 直接用本机 Word 打开（绝对 URL + 文件名编码；ofe=编辑打开）。
        // 需 Windows + 桌面版 Office；Mac 版 Word 不拉 http 远程文档。
        const storedName = decodeURIComponent((value!.split('?')[0] || '').split('/').pop() || '')
        window.location.href = `ms-word:ofe|u|${window.location.origin}/api/files/${encodeURIComponent(storedName)}`
        return
      }
      setPreviewOpen(true)
    }
    return (
      <>
        <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <a
            role="button"
            tabIndex={0}
            onClick={openPreview}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openPreview(e)
            }}
            className="flex-1 cursor-pointer truncate text-sm text-base-content hover:text-primary hover:underline [pointer-events:auto]"
            title={isWord ? `用 Word 打开：${fileName}` : `预览：${fileName}`}
          >
            {fileName}
          </a>
          <a
            role="button"
            tabIndex={0}
            onClick={openPreview}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openPreview(e)
            }}
            className="btn btn-ghost btn-xs [pointer-events:auto]"
            aria-label={isWord ? '用 Word 打开' : '预览'}
            title={isWord ? '用 Word 打开' : '预览'}
          >
            {isWord ? <FileText className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
        <FilePreview
          open={previewOpen}
          url={value!}
          fileName={fileName}
          onClose={() => setPreviewOpen(false)}
        />
      </>
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
