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
  const [effAlign, setEffAlign] = useState<'left' | 'right'>(align)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 开启时按可用空间选择展开方向，避免面板溢出视口（如靠右的列）
  const toggle = () => {
    if (!open) {
      const rect = ref.current?.getBoundingClientRect()
      if (rect) {
        const m = 8
        const fitsLeft = rect.left + width <= window.innerWidth - m // 左对齐(向右展开)放得下
        const fitsRight = rect.right - width >= m // 右对齐(向左展开)放得下
        let a: 'left' | 'right' = align
        if (a === 'left' && !fitsLeft && fitsRight) a = 'right'
        else if (a === 'right' && !fitsRight && fitsLeft) a = 'left'
        setEffAlign(a)
      }
    }
    setOpen((o) => !o)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" onClick={toggle} className="contents">
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-full z-[60] mt-1.5 rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl animate-[fadeIn_.15s_ease] ${
            effAlign === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ width }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
