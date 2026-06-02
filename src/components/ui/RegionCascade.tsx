'use client'

import { useEffect, useState } from 'react'

/**
 * 省 / 市 / 区县 三级联动选择器（受控组件）。
 *
 * - 数据来源：`src/data/pca.json`（来自 npm 包 china-division 的 dist/pca.json，省>市>区县 三级嵌套，约 47KB），
 *   组件内通过动态 import 加载，避免计入主包。
 * - 输出格式：把「省 市 区县」用单个空格拼成一个字符串，通过 onChange 输出（如 “广东省 深圳市 南山区”）。
 *   切换上级时清空下级；选齐三级后输出完整字符串。
 * - 回填：编辑已有客户时，value 为历史字符串；组件尝试按空格/斜杠解析回三级下拉，
 *   解析不出来则保留原值展示（不报错），允许用户重新选择覆盖。
 */

type PcaData = Record<string, Record<string, string[]>>

const SEP = ' '

export interface RegionCascadeProps {
  value: string
  onChange: (v: string) => void
}

// 把历史字符串拆成 [省, 市, 区县]，兼容空格 / 斜杠 / 中文空格分隔
function parseValue(raw: string): [string, string, string] {
  const parts = (raw || '')
    .split(/[\s/、]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']
}

export default function RegionCascade({ value, onChange }: RegionCascadeProps) {
  const [data, setData] = useState<PcaData | null>(null)
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')

  // 动态加载行政区划数据（不进主包）
  useEffect(() => {
    let alive = true
    void (async () => {
      const mod = await import('@/data/pca.json')
      if (!alive) return
      setData((mod.default ?? mod) as PcaData)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 数据就绪或外部 value 变化时，尝试把 value 解析回三级下拉（仅当能与数据对上时才回填）
  useEffect(() => {
    if (!data) return
    void (async () => {
      const [p, c, d] = parseValue(value)
      const nextP = data[p] ? p : ''
      const nextC = nextP && data[nextP][c] ? c : ''
      const nextD = nextC && data[nextP][nextC].includes(d) ? d : ''
      setProvince(nextP)
      setCity(nextC)
      setDistrict(nextD)
    })()
  }, [data, value])

  const emit = (p: string, c: string, d: string) => {
    const combined = [p, c, d].filter(Boolean).join(SEP)
    onChange(combined)
  }

  const handleProvince = (p: string) => {
    setProvince(p)
    setCity('')
    setDistrict('')
    emit(p, '', '')
  }

  const handleCity = (c: string) => {
    setCity(c)
    setDistrict('')
    emit(province, c, '')
  }

  const handleDistrict = (d: string) => {
    setDistrict(d)
    emit(province, city, d)
  }

  const provinces = data ? Object.keys(data) : []
  const cities = data && province && data[province] ? Object.keys(data[province]) : []
  const districts = data && province && city && data[province]?.[city] ? data[province][city] : []

  // value 有内容但解析不出省份时，说明是无法对上数据的历史值，单独提示展示
  const unparsed = !!value.trim() && !province

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-2">
        <select
          className="select select-bordered w-full"
          value={province}
          disabled={!data}
          onChange={(e) => handleProvince(e.target.value)}
        >
          <option value="">{data ? '请选择省' : '加载中…'}</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="select select-bordered w-full"
          value={city}
          disabled={!province}
          onChange={(e) => handleCity(e.target.value)}
        >
          <option value="">请选择市</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="select select-bordered w-full"
          value={district}
          disabled={!city}
          onChange={(e) => handleDistrict(e.target.value)}
        >
          <option value="">请选择区/县</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {unparsed && (
        <p className="mt-1 text-xs text-base-content/50">
          当前地址：{value}（无法匹配行政区划，可重新选择覆盖）
        </p>
      )}
    </div>
  )
}
