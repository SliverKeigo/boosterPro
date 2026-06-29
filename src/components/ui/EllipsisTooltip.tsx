'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface EllipsisTooltipProps {
  /** 完整内容（悬停时在气泡里完整展示，内容多可滚动） */
  content: string
  /** 截断区 className（如 'line-clamp-1 max-w-[200px]'），单行省略省空间 */
  className?: string
  /** 截断区显示的子节点；不传则显示 content 文本本身 */
  children?: ReactNode
}

/** 气泡最大宽度（与下方 max-w-[420px] 保持一致，用于水平越界 clamp） */
const TIP_W = 420

/**
 * 列表单元格「截断 + 悬停看全部」：
 * - 截断区按 className（line-clamp-1 / max-w）单行省略，表格保持紧凑
 * - 鼠标移上**即时**浮出气泡（无原生 title 的 ~1s 延迟），字号与正文一致（14px，不再细小）
 * - 气泡内容换行 + 限高（60vh）可滚动：内容再多也能完整看
 * - 气泡用 portal 渲染到 body + fixed 定位：不被表格 overflow-auto 裁切
 * - 仅当内容确实被截断时才浮出，短内容不弹冗余气泡；鼠标可移入气泡内滚动
 */
export function EllipsisTooltip({ content, className, children }: EllipsisTooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'down' | 'up' } | null>(
    null,
  )

  // 卸载时清掉待执行的隐藏定时器
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

  const text = content ?? ''
  // 无内容：直接渲染、不挂悬停逻辑
  if (!text) return <span className={className}>{children ?? text}</span>

  const open = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    // 仅当内容被截断（单行超宽或多行被压成一行）时才浮出，短内容不弹
    const truncated = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
    if (!truncated) return
    const r = el.getBoundingClientRect()
    // 水平：左对齐单元格，超右边界则左移，留 8px 边距
    const left = Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8))
    // 垂直：默认气泡在下方；单元格落在视口下半则改向上展开，避免气泡跑出屏幕
    const placement: 'down' | 'up' = r.bottom > window.innerHeight * 0.6 ? 'up' : 'down'
    const top = placement === 'down' ? r.bottom + 6 : r.top - 6
    setPos({ left, top, placement })
  }
  // 移出后稍延迟隐藏，给「鼠标移进气泡里滚动」留出时间
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setPos(null), 120)
  }
  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }

  return (
    <>
      <span ref={ref} className={className} onMouseEnter={open} onMouseLeave={scheduleHide}>
        {children ?? text}
      </span>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[2000] max-h-[60vh] max-w-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm leading-relaxed text-base-content shadow-xl"
            style={
              pos.placement === 'down'
                ? { left: pos.left, top: pos.top }
                : { left: pos.left, bottom: window.innerHeight - pos.top }
            }
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
