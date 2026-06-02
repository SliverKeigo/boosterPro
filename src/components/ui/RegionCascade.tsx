'use client'

import { useEffect, useState } from 'react'

import { extraRegions, type RegionNode } from '@/data/regionsExtra'

/**
 * 深度自适应的行政区划级联选择器（受控组件）。
 *
 * 数据来源：
 * - 大陆：`src/data/pca.json`（china-division，省>市>区县 三级嵌套，约 47KB），运行时动态 import，不计入主包。
 * - 港澳台 / 海外：`src/data/regionsExtra.ts`，作为顶级节点追加到大陆各省之后。
 *
 * 级联深度按节点自适应（不是固定 3 个下拉）：
 * - 普通省：省 → 市 → 区县（3 级）
 * - 直辖市（北京 / 天津 / 上海 / 重庆）：省 → 区（2 级，去掉「市辖区」中间层）
 * - 香港 / 澳门：省 → 区（2 级）；台湾：省 → 县市（2 级）；海外：海外 → 国家地区（2 级）
 * 选完某级才渲染下一级；选中节点没有 children 就不再渲染。
 *
 * 输出：把已选路径各级 label 用单个空格拼成字符串，通过 onChange 输出
 * （如 “广东省 深圳市 南山区” / “天津市 和平区” / “海外 美国”）。切换某级时清空其后所有级。
 *
 * 回填：编辑历史数据时 value 为字符串，按空格 / 斜杠拆分逐级匹配回填；匹配不上的级留空、
 * 显示当前值提示、允许重选，不报错。
 */

type PcaData = Record<string, Record<string, string[]>>

const SEP = ' '

// 需要扁平化的直辖市：其下「市辖区 / 县」伪市级层要跳过，区县直接提升为省的下一级
const MUNICIPALITIES = new Set(['北京市', '天津市', '上海市', '重庆市'])
// 直辖市下需要跳过的伪市级键
const PSEUDO_CITY_KEYS = new Set(['市辖区', '县'])

export interface RegionCascadeProps {
  value: string
  onChange: (v: string) => void
}

// 把 pca.json + regionsExtra 构建成统一的递归树
function buildTree(pca: PcaData): RegionNode[] {
  const provinces: RegionNode[] = Object.keys(pca).map((province) => {
    const cityMap = pca[province]

    // 直辖市扁平化：把所有伪市级层（市辖区 / 县）下的区县直接收集为省的 children
    if (MUNICIPALITIES.has(province)) {
      const leaves: RegionNode[] = []
      for (const cityKey of Object.keys(cityMap)) {
        if (PSEUDO_CITY_KEYS.has(cityKey)) {
          for (const district of cityMap[cityKey]) leaves.push({ label: district })
        } else {
          // 兜底：万一直辖市下出现真实市名，保留为带区县的子节点
          leaves.push({
            label: cityKey,
            children: cityMap[cityKey].map((d) => ({ label: d })),
          })
        }
      }
      return { label: province, children: leaves }
    }

    // 普通省：省 → 市 → 区县
    return {
      label: province,
      children: Object.keys(cityMap).map((city) => ({
        label: city,
        children: cityMap[city].map((district) => ({ label: district })),
      })),
    }
  })

  // 港澳台 / 海外追加到最后
  return [...provinces, ...extraRegions]
}

// 把历史字符串拆成各级 label（兼容空格 / 斜杠 / 中文顿号分隔）
function splitParts(raw: string): string[] {
  return (raw || '')
    .split(/[\s/、]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// 按历史 parts 在树中逐级匹配，返回能对上的选中路径（匹配不上即停止）
function resolvePath(tree: RegionNode[], parts: string[]): string[] {
  const path: string[] = []
  let level = tree
  for (const part of parts) {
    const hit = level.find((n) => n.label === part)
    if (!hit) break
    path.push(hit.label)
    if (!hit.children || hit.children.length === 0) break
    level = hit.children
  }
  return path
}

export default function RegionCascade({ value, onChange }: RegionCascadeProps) {
  const [tree, setTree] = useState<RegionNode[] | null>(null)
  // 已选路径（每级一个 label）
  const [path, setPath] = useState<string[]>([])

  // 动态加载行政区划数据并构建树（不进主包）
  useEffect(() => {
    let alive = true
    void (async () => {
      const mod = await import('@/data/pca.json')
      if (!alive) return
      const pca = (mod.default ?? mod) as PcaData
      setTree(buildTree(pca))
    })()
    return () => {
      alive = false
    }
  }, [])

  // 数据就绪或外部 value 变化时，尝试把 value 解析回各级（仅当能与树对上时才回填）
  useEffect(() => {
    if (!tree) return
    void (async () => {
      setPath(resolvePath(tree, splitParts(value)))
    })()
  }, [tree, value])

  // 根据已选路径，逐级算出要渲染的下拉：每级有可选项列表与当前选中值
  const levels: { options: RegionNode[]; selected: string }[] = []
  if (tree) {
    let options: RegionNode[] | undefined = tree
    let depth = 0
    while (options && options.length > 0) {
      const selected = path[depth] ?? ''
      levels.push({ options, selected })
      if (!selected) break // 当前级未选，不再往下展开
      const node: RegionNode | undefined = options.find((n) => n.label === selected)
      options = node?.children
      depth += 1
    }
  }

  // 切换第 idx 级：保留其前各级，写入新值，清空其后所有级，再输出
  const handleChange = (idx: number, label: string) => {
    const next = path.slice(0, idx)
    if (label) next.push(label)
    setPath(next)
    onChange(next.join(SEP))
  }

  // value 有内容但一个都没解析出来，说明是无法对上数据的历史值，单独提示
  const unparsed = !!value.trim() && path.length === 0

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {!tree && (
          <select className="select select-bordered w-40" disabled value="">
            <option value="" disabled hidden>
              加载中…
            </option>
          </select>
        )}

        {tree &&
          levels.map((lvl, idx) => (
            <select
              key={idx}
              className="select select-bordered w-40"
              value={lvl.selected}
              onChange={(e) => handleChange(idx, e.target.value)}
            >
              <option value="" disabled hidden>
                请选择
              </option>
              {lvl.options.map((n) => (
                <option key={n.label} value={n.label}>
                  {n.label}
                </option>
              ))}
            </select>
          ))}
      </div>

      {unparsed && (
        <p className="mt-1 text-xs text-base-content/50">
          当前地址：{value}（无法匹配行政区划，可重新选择覆盖）
        </p>
      )}
    </div>
  )
}
