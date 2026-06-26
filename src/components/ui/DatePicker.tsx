'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

interface DatePickerProps {
  value: string // 'YYYY-MM-DD'（也容忍带时间的 ISO，取前 10 位）；空串=未选
  onChange: (value: string) => void // 回传 'YYYY-MM-DD'，与原生 <input type="date"> 一致
  placeholder?: string
  className?: string
  /** 允许清除（显示 ✕），默认 true */
  allowClear?: boolean
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '')
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 通用日期选择器：点击弹日历、显示 `YYYY-MM-DD`、跨浏览器/系统一致（替代原生
 * `<input type="date">`，避免 Windows 中文系统下渲染成 `yyyy/mm/日`）。
 * 接口与原生 date input 对齐：value/onChange 均用 'YYYY-MM-DD' 字符串。
 */
export function DatePicker({
  value,
  onChange,
  placeholder = '请选择日期',
  className = 'input input-bordered w-full',
  allowClear = true,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = parse(value)
  const display = value ? value.slice(0, 10) : ''
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = selected ?? new Date()
    return { y: base.getFullYear(), m: base.getMonth() }
  })

  // 打开面板：定位到已选月（或今天）。放在点击事件里而非 effect，避免 effect 内同步 setState。
  const openPanel = () => {
    const base = parse(value) ?? new Date()
    setView({ y: base.getFullYear(), m: base.getMonth() })
    setOpen(true)
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 当月日历网格（6×7，含上/下月补位）
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const gridStart = new Date(view.y, view.m, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [view])

  const today = fmt(new Date())
  const move = (delta: number) => {
    const m = view.m + delta
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${className} flex items-center justify-between font-normal`}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className={display ? '' : 'text-base-content/40'}>{display || placeholder}</span>
        <span className="bp-ro-hide flex shrink-0 items-center gap-1">
          {allowClear && display && (
            <X
              className="h-3.5 w-3.5 text-base-content/40 hover:text-base-content"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange('')
              }}
            />
          )}
          <Calendar className="h-4 w-4 opacity-50" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
          {/* 年月导航 */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => move(-1)} aria-label="上一月">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{view.y} 年 {view.m + 1} 月</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => move(1)} aria-label="下一月">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* 星期表头 */}
          <div className="grid grid-cols-7 text-center text-xs text-base-content/50">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>
          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              const ds = fmt(d)
              const cur = d.getMonth() === view.m
              const isSel = ds === display
              const isToday = ds === today
              return (
                <button
                  key={i}
                  type="button"
                  className={`flex h-8 items-center justify-center rounded-md text-sm ${
                    isSel
                      ? 'bg-primary text-primary-content'
                      : cur
                        ? 'hover:bg-base-200'
                        : 'text-base-content/30 hover:bg-base-200'
                  } ${isToday && !isSel ? 'ring-1 ring-primary/40' : ''}`}
                  onClick={() => {
                    onChange(ds)
                    setOpen(false)
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          {/* 快捷：今天 / 清除 */}
          <div className="mt-2 flex justify-between">
            <button type="button" className="btn btn-ghost btn-xs text-primary" onClick={() => { onChange(today); setOpen(false) }}>
              今天
            </button>
            {allowClear && (
              <button type="button" className="btn btn-ghost btn-xs text-base-content/60" onClick={() => { onChange(''); setOpen(false) }}>
                清除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
