'use client'

import { FileUpload } from './FileUpload'

interface MultiFileUploadProps {
  /** 已上传文件的 URL 列表（每项 /api/files/xxx）。对应 schema 的 String[] 字段 */
  value?: string[]
  onChange: (urls: string[]) => void
  accept?: string
}

// 多附件上传：单个字段可传任意多份。编排多个 FileUpload——
// 每个已上传项各占一行(自带预览/下载/移除)，底部一个空上传区用于「继续添加」。
// 复用 FileUpload 全部逻辑(上传/Office 预览/只读态豁免)，不重复实现。
export function MultiFileUpload({ value = [], onChange, accept }: MultiFileUploadProps) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((url, i) => (
        <FileUpload
          // url 可能重复(同名文件不会，因上传加时间戳前缀)，加 index 兜底 key 稳定
          key={`${i}-${url}`}
          value={url}
          accept={accept}
          onChange={(v) => {
            // 已上传项的 onChange：'' = 点了移除 → 从数组删除该项；非空 = 理论上不会(已传项不再上传)，按替换处理
            if (!v) onChange(value.filter((_, idx) => idx !== i))
            else onChange(value.map((u, idx) => (idx === i ? v : u)))
          }}
        />
      ))}
      {/* 继续添加：空 FileUpload，上传成功后 append 到数组 */}
      <FileUpload
        value=""
        accept={accept}
        onChange={(url) => {
          if (url) onChange([...value, url])
        }}
      />
      {value.length > 0 && (
        <div className="text-xs text-base-content/40">共 {value.length} 个附件，可继续添加</div>
      )}
    </div>
  )
}
