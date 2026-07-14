// 时间统一按北京时间（东八 +08:00）展示。
//
// 背景：DB 的时间列是 timestamp without time zone、Prisma 按 UTC 存；接口把 Date 序列化成
// UTC 的 ISO 串（末尾 Z）。前端若直接 `s.slice(0,10)` / `slice(11,16)` 截这个 UTC 串，会比
// 东八**早 8 小时**（如东八 09:53 存成 01:53、页面就显示 01:53）。故统一 +8h 转东八再截。
// 与封存包导出的 bjStr（src/lib/jodooExport.ts）同源、口径一致。
const bjStr = (d: string | Date, len: number): string =>
  new Date(new Date(d).getTime() + 8 * 3600 * 1000).toISOString().slice(0, len)

/** 北京时间日期 YYYY-MM-DD；空值返回 '' */
export const fmtDate = (s?: string | null): string => (s ? bjStr(s, 10) : '')

/** 北京时间日期时间 YYYY-MM-DD HH:mm；空值返回 '—' */
export const fmtDateTime = (s?: string | null): string => (s ? bjStr(s, 16).replace('T', ' ') : '—')
