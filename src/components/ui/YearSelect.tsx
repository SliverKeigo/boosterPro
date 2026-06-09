'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

interface YearSelectProps {
  value: number | string | null | undefined
  onChange: (value: string) => void
  /** 最早可选年份，默认 1950 */
  minYear?: number
  /** 允许选到未来多少年（默认 0 = 今年）。如签订年份传 10 表示最大可选到今年+10 */
  maxFuture?: number
  placeholder?: string
  className?: string
}

// 生成年份数字列表：[今年+maxFuture … minYear]，降序。
export function yearList(minYear = 1950, maxFuture = 0): number[] {
  const max = new Date().getFullYear() + maxFuture
  const ys: number[] = []
  for (let y = max; y >= minYear; y--) ys.push(y)
  return ys
}

// 供 BoostTable 列筛选用的年份下拉选项（与 YearSelect 同口径，保证筛选与表单一致）。
export function yearOptions(minYear = 1950, maxFuture = 0): { label: string; value: string }[] {
  return yearList(minYear, maxFuture).map((y) => ({ label: String(y), value: String(y) }))
}

/**
 * 通用「年份」选择器（点击弹出年份网格面板）。
 * - 范围：[minYear, 今年 + maxFuture]，降序。
 * - 关键：若已存值落在范围之外（很久以前 / 未来的越界年份），会自动把该值补进选项，
 *   保证任何历史 / 未来年份都能正常回显、编辑时不丢值——避免"固定窗口"导致旧数据显示空白。
 */
export function YearSelect({
  value,
  onChange,
  minYear = 1950,
  maxFuture = 0,
  placeholder = '请选择年份',
  className = 'input input-bordered w-full',
}: YearSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const years = yearList(minYear, maxFuture)

  const v = value === '' || value == null ? null : Number(value)
  const selected = v != null && !Number.isNaN(v) ? v : null
  if (selected != null && !years.includes(selected)) {
    years.push(selected)
    years.sort((a, b) => b - a)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${className} flex items-center justify-between`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected == null ? 'text-base-content/40' : undefined}>
          {selected != null ? selected : placeholder}
        </span>
        <Calendar className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
          <div className="grid grid-cols-4 gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`btn btn-sm ${y === selected ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  onChange(String(y))
                  setOpen(false)
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
