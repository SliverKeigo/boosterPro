'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface DropdownProps {
  /** 触发器内容（按钮本体） */
  trigger: ReactNode
  /** 下拉面板内容 */
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'left' | 'right'
  /** 面板宽度，单位 px */
  width?: number
  className?: string
}

/** 受控开关 + 点击外部关闭的通用下拉容器 */
export function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 220,
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="contents">
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full z-[60] mt-1.5 rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl animate-[fadeIn_.15s_ease] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ width }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
