'use client'

import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
  className?: string
}

/** 通用表单字段：标签 + 控件 + 错误提示。控件用 daisyUI 类（input input-bordered 等） */
export function Field({ label, required, error, children, className = '' }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-sm font-medium text-base-content/70">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  )
}
