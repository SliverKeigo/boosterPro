'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react'
import { Dropdown } from './Dropdown'

export interface SubTableCellColumn {
  key: string
  title: string
  /** 自定义渲染该字段值；不传则直接取 row[key] */
  render?: (value: any, row: any) => ReactNode
}

/**
 * 列表中「一对多子表」字段的展示：
 * 单元格内显示「查看 N」入口，点击弹出浮层，按条列出子表每行的所有字段（完整内容、长文本换行、可滚动）。
 * 仅展示，不可编辑（编辑在表单的 SubTable 里）。
 */
export function SubTableCell({
  rows,
  columns,
  title,
  unit = '项',
}: {
  rows: any[] | null | undefined
  columns: SubTableCellColumn[]
  title?: string
  unit?: string
}) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return <span className="text-base-content/30">—</span>

  return (
    <Dropdown
      align="right"
      width={440}
      trigger={
        <button type="button" className="btn btn-ghost btn-xs gap-1 font-normal text-primary">
          查看
          <span className="badge badge-primary badge-sm">{list.length}</span>
        </button>
      }
    >
      <div className="max-h-[60vh] w-full overflow-auto">
        {title && (
          <div className="mb-2 px-0.5 text-xs font-semibold text-base-content/55">
            {title}（共 {list.length} {unit}）
          </div>
        )}
        <div className="space-y-2">
          {list.map((row, i) => (
            <div key={i} className="rounded-lg border border-base-200 bg-base-100 p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-base-content/40">#{i + 1}</div>
              {columns.map((c) => {
                const val = c.render ? c.render(row[c.key], row) : row[c.key]
                if (val == null || val === '') return null
                return (
                  <div key={c.key} className="mb-2 last:mb-0">
                    <div className="text-xs font-medium text-base-content/45">{c.title}</div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-base-content/90">
                      {val}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Dropdown>
  )
}
