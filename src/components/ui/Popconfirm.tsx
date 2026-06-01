'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface PopconfirmProps {
  title: string
  description?: string
  onConfirm: () => void
  okText?: string
  cancelText?: string
  okDanger?: boolean
  children: ReactNode
}

export function Popconfirm({
  title,
  description,
  onConfirm,
  okText = '确认',
  cancelText = '取消',
  okDanger = true,
  children,
}: PopconfirmProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // 面板宽 256px(w-64) 右对齐到触发器右缘，clamp 防止左侧溢出视口
    setPos({ top: r.bottom + 6, left: Math.max(r.right, 264) })
  }, [])

  const openPop = () => {
    reposition()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    // 打开期间滚动/缩放时跟随触发器重新定位（capture 捕获嵌套滚动容器）
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  return (
    <>
      <span ref={triggerRef} className="inline-flex" onClick={openPop}>
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[2000] w-64 -translate-x-full rounded-xl border border-base-300 bg-base-100 p-3 shadow-xl animate-[fadeIn_.15s_ease]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="flex-1">
                <div className="text-sm font-medium text-base-content">{title}</div>
                {description && (
                  <div className="mt-1 text-xs text-base-content/60">{description}</div>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>
                {cancelText}
              </button>
              <button
                type="button"
                className={`btn btn-xs ${okDanger ? 'btn-error' : 'btn-primary'}`}
                onClick={() => {
                  setOpen(false)
                  onConfirm()
                }}
              >
                {okText}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
