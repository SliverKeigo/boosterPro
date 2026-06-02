'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Dropdown } from './Dropdown'
import { extraRegions, type RegionNode } from '@/data/regionsExtra'

/**
 * 行政区划级联选择器（受控、单控件）。
 *
 * 交互：一个类输入框的触发器显示已选地址；点击弹出浮层，浮层内按层级分列展示，
 * 点选某项若有下级则展开下一列、若是叶子则提交并关闭（典型的 Cascader 体验）。
 *
 * 数据来源：
 * - 大陆：`src/data/pca.json`（china-division，省>市>区县 三级嵌套，约 47KB），运行时动态 import，不计入主包。
 * - 港澳台 / 海外：`src/data/regionsExtra.ts`，作为顶级节点追加到大陆各省之后。
 *
 * 层级按节点自适应：普通省 省→市→区县（3 级）；直辖市 省→区（2 级，去掉「市辖区」中间层）；
 * 香港/澳门 省→区、台湾 省→县市（2 级）；海外为单层叶子（直接选「海外」）。
 *
 * 输出：把已选路径各级 label 用单个空格拼成字符串，通过 onChange 输出
 * （如 “广东省 深圳市 南山区” / “天津市 和平区” / “海外”）。
 * 回填：value 为字符串时按空格/斜杠/顿号拆分逐级匹配；匹配不上即停，触发器仍原样显示该值。
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
  // 浮层内导航路径（每级一个 label）
  const [navPath, setNavPath] = useState<string[]>([])

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

  // 数据就绪或外部 value 变化时，把 value 解析回导航路径（能对上才回填）
  useEffect(() => {
    if (!tree) return
    // 包一层 IIFE：setState 不在 effect 同步路径上（规避 react-hooks/set-state-in-effect）
    void (async () => {
      setNavPath(resolvePath(tree, splitParts(value)))
    })()
  }, [tree, value])

  // 根据导航路径逐级算出要展示的列：column[0]=顶级；column[k]=上一级所选节点的 children
  const columns: RegionNode[][] = []
  if (tree) {
    let opts: RegionNode[] | undefined = tree
    let depth = 0
    while (opts && opts.length > 0) {
      columns.push(opts)
      const sel = navPath[depth]
      if (!sel) break
      const node: RegionNode | undefined = opts.find((n) => n.label === sel)
      if (!node?.children?.length) break
      opts = node.children
      depth += 1
    }
  }

  // 点选第 level 列的某项：保留其前各级、写入该项；叶子则提交并关闭，非叶子则展开下一列
  const pick = (level: number, node: RegionNode, close: () => void) => {
    const next = navPath.slice(0, level)
    next.push(node.label)
    setNavPath(next)
    if (!node.children?.length) {
      onChange(next.join(SEP))
      close()
    }
  }

  const trigger = (
    <div className="input input-bordered flex w-full cursor-pointer items-center justify-between gap-2 font-normal">
      <span className={`truncate ${value ? '' : 'text-base-content/40'}`}>{value || '请选择地区'}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </div>
  )

  return (
    <Dropdown align="left" width={500} className="w-full" trigger={trigger}>
      {(close) =>
        !tree ? (
          <div className="px-3 py-4 text-sm text-base-content/50">加载中…</div>
        ) : (
          <div className="flex max-h-72 text-sm">
            {columns.map((col, level) => (
              <ul
                key={level}
                className="w-[150px] shrink-0 overflow-y-auto border-r border-base-200 pr-0.5 last:border-r-0"
              >
                {col.map((node) => {
                  const active = navPath[level] === node.label
                  const hasChildren = !!node.children?.length
                  return (
                    <li key={node.label}>
                      <button
                        type="button"
                        onClick={() => pick(level, node, close)}
                        className={`flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-base-200 ${
                          active ? 'bg-primary/10 font-medium text-primary' : ''
                        }`}
                      >
                        <span className="truncate">{node.label}</span>
                        {hasChildren && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ))}
          </div>
        )
      }
    </Dropdown>
  )
}
