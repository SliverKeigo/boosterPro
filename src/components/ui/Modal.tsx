'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title?: ReactNode
  onClose: () => void
  onOk?: () => void
  okText?: string
  cancelText?: string
  confirmLoading?: boolean
  /** 内容最大宽度，单位 px，默认 720（size='full' 时忽略） */
  width?: number
  /** 尺寸：'md'（默认，居中卡片）| 'full'（近全屏铺满，适合大表单/矩阵） */
  size?: 'md' | 'full'
  /** 传 null 隐藏底部操作栏 */
  footer?: ReactNode | null
  /** 只读(详情)模式：禁用内部所有表单控件；底部默认显示「关闭 + 编辑」 */
  readOnly?: boolean
  /** 只读模式下点「编辑」的回调；不传则不显示编辑按钮 */
  onEdit?: () => void
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
  size = 'md',
  footer,
  readOnly = false,
  onEdit,
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

  // 只读模式：把每个 textarea 高度撑到内容实际高度，完整显示（不依赖 field-sizing 浏览器支持）
  const roRef = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    if (!open || !readOnly) return
    const id = requestAnimationFrame(() => {
      roRef.current?.querySelectorAll('textarea').forEach((ta) => {
        ta.style.height = 'auto'
        ta.style.height = `${ta.scrollHeight}px`
      })
    })
    return () => cancelAnimationFrame(id)
  }, [open, readOnly])

  if (!open) return null

  return (
    // 点击遮罩(modal 外面)不关闭——必须点右上角 X / 底部「关闭/取消」按钮，避免误点丢数据
    <div className={`fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 backdrop-blur-[2px] ${size === 'full' ? 'p-2 py-4' : 'p-4 py-10'}`}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full rounded-2xl bg-base-100 shadow-2xl animate-[fadeIn_.18s_ease]"
        style={size === 'full' ? { maxWidth: '96vw', width: '96vw' } : { maxWidth: width }}
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

        {/* Body（只读模式：fieldset disabled 禁用原生控件 + pointer-events-none 拦截自定义控件点击） */}
        <div className={`overflow-y-auto px-6 py-5 ${size === 'full' ? 'max-h-[82vh]' : 'max-h-[70vh]'}`}>
          {readOnly ? (
            <fieldset
              ref={roRef}
              disabled
              className="m-0 min-w-0 select-text border-0 p-0 [&_.input]:!h-auto [&_.input]:!min-h-0 [&_.input]:!cursor-text [&_.input]:!border-transparent [&_.input]:!bg-transparent [&_.input]:!px-0 [&_.input]:!text-base-content [&_.input]:!opacity-100 [&_.select]:!cursor-text [&_.select]:!border-transparent [&_.select]:!bg-transparent [&_.select]:!px-0 [&_.select]:![background-image:none] [&_.select]:!text-base-content [&_.select]:!opacity-100 [&_.textarea]:!cursor-text [&_.textarea]:!border-transparent [&_.textarea]:!bg-transparent [&_.textarea]:!px-0 [&_.textarea]:!resize-none [&_.textarea]:!text-base-content [&_.textarea]:!opacity-100 [&_.textarea]:[field-sizing:content] [&_.textarea]:!overflow-hidden [&_.bp-ro-hide]:!hidden [&_.ql-toolbar]:!hidden [&_.ql-container]:!border-0 [&_.ql-editor]:!px-0 [&_.ql-editor]:!py-0 [&_.ql-editor]:!text-base-content [&_.ql-editor]:!pointer-events-none [&_div.input]:!pointer-events-none [&_.bp-ro-flat]:!border-transparent [&_.bp-ro-flat]:!bg-transparent"
            >
              {children}
            </fieldset>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {footer !== null && (
          <div className="sticky bottom-0 z-10 flex justify-end gap-3 rounded-b-2xl border-t border-base-300 bg-base-100 px-6 py-4">
            {footer ?? (readOnly ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  关闭
                </button>
                {onEdit && (
                  <button type="button" className="btn btn-primary" onClick={onEdit}>
                    编辑
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  {cancelText}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  // 点保存前先让当前输入框 blur：触发中文输入法 compositionend + onChange，
                  // 确保未上屏的拼音 / 最后一段输入已提交进表单，避免「保存的是旧内容」竞态
                  onMouseDown={() => (document.activeElement as HTMLElement | null)?.blur()}
                  onClick={onOk}
                  disabled={confirmLoading}
                >
                  {confirmLoading && <span className="loading loading-spinner loading-sm" />}
                  {okText}
                </button>
              </>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
