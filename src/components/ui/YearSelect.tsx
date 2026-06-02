'use client'

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

/**
 * 通用「年份」下拉。
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
  className = 'select select-bordered w-full',
}: YearSelectProps) {
  const max = new Date().getFullYear() + maxFuture
  const years: number[] = []
  for (let y = max; y >= minYear; y--) years.push(y)

  const v = value === '' || value == null ? null : Number(value)
  if (v != null && !Number.isNaN(v) && !years.includes(v)) {
    years.push(v)
    years.sort((a, b) => b - a)
  }

  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled hidden>
        {placeholder}
      </option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
