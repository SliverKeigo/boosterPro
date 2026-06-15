'use client'

import { X } from 'lucide-react'

interface MultiDatePickerProps {
  /** 已选日期，ISO 字符串数组（YYYY-MM-DD） */
  value: string[]
  onChange: (next: string[]) => void
  /** 只读：仅展示 chip，不可增删 */
  readOnly?: boolean
  /** 可选上限（达到后隐藏追加框） */
  max?: number
  className?: string
}

// 显示用：YYYY-MM-DD → M.D（贴合用户「6.2」习惯）；非法格式原样返回。
function fmtShort(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  return m ? `${Number(m[2])}.${Number(m[3])}` : d
}

// 组员日期多选：已选日期以 chip 列出（可删），底部一个原生 date 选择器追加（去重、升序）。
export function MultiDatePicker({ value, onChange, readOnly = false, max, className }: MultiDatePickerProps) {
  const dates = Array.isArray(value) ? value : []
  const add = (d: string) => {
    if (!d || dates.includes(d) || (max != null && dates.length >= max)) return
    onChange([...dates, d].sort())
  }
  const remove = (d: string) => onChange(dates.filter((x) => x !== d))

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dates.map((d) => (
            <span key={d} className="badge badge-sm badge-primary gap-1 whitespace-nowrap" title={d}>
              {fmtShort(d)}
              {!readOnly && (
                <button
                  type="button"
                  aria-label="移除日期"
                  className="cursor-pointer hover:text-error"
                  onClick={() => remove(d)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!readOnly && (max == null || dates.length < max) && (
        <input
          type="date"
          aria-label="添加计划日期"
          className="input input-bordered input-xs w-[8.5rem]"
          value=""
          onChange={(e) => add(e.target.value)}
        />
      )}
      {readOnly && dates.length === 0 && <span className="text-xs text-base-content/30">—</span>}
    </div>
  )
}
