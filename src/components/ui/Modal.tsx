'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title?: ReactNode
  onClose: () => void
  onOk?: () => void
  okText?: string
  cancelText?: string
  confirmLoading?: boolean
  /** 内容最大宽度，单位 px，默认 720 */
  width?: number
  /** 传 null 隐藏底部操作栏 */
  footer?: ReactNode | null
  children: ReactNode
}

export function Modal({
  open,
  title,
  onClose,
  onOk,
  okText = '确定',
  cancelText = '取消',
  confirmLoading = false,
  width = 720,
  footer,
  children,
}: ModalProps) {
  // ESC 关闭 + 滚动锁定
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full rounded-2xl bg-base-100 shadow-2xl animate-[fadeIn_.18s_ease]"
        style={{ maxWidth: width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 px-6 py-4">
          <div className="text-base font-bold text-base-content">{title}</div>
          <button
            type="button"
            aria-label="关闭"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer !== null && (
          <div className="flex justify-end gap-3 border-t border-base-300 px-6 py-4">
            {footer ?? (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  {cancelText}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onOk}
                  disabled={confirmLoading}
                >
                  {confirmLoading && <span className="loading loading-spinner loading-sm" />}
                  {okText}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
