'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Plus, Trash2 } from 'lucide-react'
import { FileUpload } from './FileUpload'
import { MultiFileUpload } from './MultiFileUpload'

export interface SubTableColumn {
  key: string
  title: string
  // file=单附件(值 string)；file-multi=多附件(值 string[])
  type?: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'file' | 'file-multi'
  options?: { label: string; value: string }[]
  accept?: string // type='file'/'file-multi' 时透传给上传组件
  width?: number
  placeholder?: string
}

interface SubTableProps {
  title?: string
  columns: SubTableColumn[]
  value: Record<string, any>[]
  onChange: (rows: Record<string, any>[]) => void
  addText?: string
}

function Field({
  col,
  value,
  onChange,
}: {
  col: SubTableColumn
  value: any
  onChange: (v: any) => void
}) {
  const v = value ?? ''
  switch (col.type) {
    case 'textarea':
      return (
        <textarea
          className="textarea textarea-bordered textarea-sm w-full"
          rows={1}
          value={v}
          placeholder={col.placeholder ?? '请输入'}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className="input input-bordered input-sm w-full"
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          className="input input-bordered input-sm w-full"
          value={v}
          placeholder={col.placeholder ?? '请输入'}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        <select
          className="select select-bordered select-sm w-full"
          value={v}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled hidden>请选择</option>
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'file':
      return <FileUpload value={v || undefined} onChange={(url) => onChange(url)} accept={col.accept} />
    case 'file-multi':
      return <MultiFileUpload value={Array.isArray(v) ? v : []} onChange={(urls) => onChange(urls)} accept={col.accept} />
    default:
      return (
        <input
          type="text"
          className="input input-bordered input-sm w-full"
          value={v}
          placeholder={col.placeholder ?? '请输入'}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

/** 表单内嵌子表：支持多行新增 / 删除 / 行内编辑 */
export function SubTable({ title, columns, value, onChange, addText = '新增一项' }: SubTableProps) {
  const rows = value ?? []

  const update = (i: number, key: string, v: any) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))
  }
  const addRow = () => {
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])
  }
  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {title && (
        <label className="mb-1.5 block text-sm font-medium text-base-content/70">{title}</label>
      )}
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr className="bg-base-200/60">
              <th className="w-10 text-center text-xs text-base-content/50">#</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.width ?? 140 }}
                  className="text-xs font-semibold text-base-content/60"
                >
                  {c.title}
                </th>
              ))}
              <th className="w-16 text-xs text-base-content/60">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="py-4 text-center text-sm text-base-content/40"
                >
                  暂无数据，点击下方按钮添加
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="text-center text-sm text-base-content/50">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key}>
                    <Field col={c} value={row[c.key]} onChange={(v) => update(i, c.key, v)} />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    aria-label="删除该行"
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost btn-sm mt-2 gap-1.5" onClick={addRow}>
        <Plus className="h-4 w-4" />
        {addText}
      </button>
    </div>
  )
}
