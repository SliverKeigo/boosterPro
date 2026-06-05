'use client'

import { useState } from 'react'
import { UploadCloud, CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface ImportResult {
  created: number
  updated: number
  failed: number
  errors: { row: number; msg: string }[]
}

export function ImportModal({
  open,
  onClose,
  resource,
  endpoint,
  title = '导入',
  onDone,
}: {
  open: boolean
  onClose: () => void
  resource?: string
  endpoint?: string // 自定义导入端点（如工作计划 /api/work-plans/import）；不传则用 /api/import/<resource>
  title?: string
  onDone?: () => void
}) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => { setFile(null); setLoading(false); setResult(null) }
  const close = () => { reset(); onClose() }

  const submit = async () => {
    if (result) return close() // 已出结果 → 「完成」即关闭
    if (!file) return toast.error('请选择要导入的 .xlsx 文件')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(endpoint || `/api/import/${resource}`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error || '导入失败'); return }
      setResult(json as ImportResult)
      if ((json.failed ?? 0) === 0) {
        toast.success(`导入成功：新增 ${json.created}、更新 ${json.updated}`)
        onDone?.()
      } else {
        toast.error(`有 ${json.failed} 行未通过校验，整批未写入`)
      }
    } catch {
      toast.error('导入请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      onOk={submit}
      okText={result ? '完成' : '开始导入'}
      confirmLoading={loading}
      width={560}
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-base-200/60 p-3 text-xs text-base-content/70">
          先「导出」当前列表得到 .xlsx，改完再从这里导入。<b>含 id 的行=更新、id 留空的行=新增</b>；
          关系列（如客户/岗位）按名称匹配；子表列<b>每行一条、字段用 | 分隔</b>（表头已标字段顺序）。<b>任一行校验失败将整批不写入</b>，请按提示改对后重试。
        </div>

        {!result && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-base-300 p-6 hover:border-primary">
            <UploadCloud className="h-8 w-8 text-base-content/40" />
            <span className="text-sm">{file ? file.name : '点击选择 .xlsx 文件'}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              {result.failed === 0 ? (
                <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />导入完成</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-error"><XCircle className="h-4 w-4" />整批未写入</span>
              )}
              <span className="badge badge-success badge-sm">新增 {result.created}</span>
              <span className="badge badge-info badge-sm">更新 {result.updated}</span>
              {result.failed > 0 && <span className="badge badge-error badge-sm">失败 {result.failed}</span>}
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-base-300 text-xs">
                <table className="table table-xs">
                  <thead><tr><th className="w-16">行号</th><th>原因</th></tr></thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i}><td>第 {e.row} 行</td><td className="text-error">{e.msg}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="btn btn-ghost btn-xs" onClick={reset}>重新选择文件</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
