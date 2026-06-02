'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  FileText,
  FilePlus,
  UsersRound,
  Target,
  Building2,
  FileSignature,
  BookOpen,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useMyPermissions } from '@/lib/usePermissions'
import { PATH_TO_RESOURCE } from '@/lib/resources'

interface Entry {
  href: string
  label: string
  desc: string
  icon: LucideIcon
  tint: string
}

const ENTRIES: Entry[] = [
  { href: '/candidates', label: '候选人管理', desc: '挖猎进度与推荐状态跟踪', icon: Users, tint: 'bg-sky-100 text-sky-600' },
  { href: '/requirements', label: '客户需求管理', desc: 'JD 与岗位画像管理', icon: FileText, tint: 'bg-indigo-100 text-indigo-600' },
  { href: '/supplements', label: '客户补充信息', desc: '需求更新与客户画像', icon: FilePlus, tint: 'bg-violet-100 text-violet-600' },
  { href: '/talent-pool', label: '人才储备库', desc: '人才资源沉淀与复用', icon: UsersRound, tint: 'bg-cyan-100 text-cyan-600' },
  { href: '/opportunities', label: '商机管理', desc: '销售线索与商机推进', icon: Target, tint: 'bg-amber-100 text-amber-600' },
  { href: '/clients', label: '客户基本信息', desc: '客户档案与对标企业', icon: Building2, tint: 'bg-emerald-100 text-emerald-600' },
  { href: '/contracts', label: '销售合同', desc: '合同与发票信息', icon: FileSignature, tint: 'bg-rose-100 text-rose-600' },
  { href: '/knowledge', label: '公司知识库', desc: '知识沉淀与管理细则', icon: BookOpen, tint: 'bg-teal-100 text-teal-600' },
]

export default function HomePage() {
  const [name, setName] = useState('')
  const { can, loading: permLoading } = useMyPermissions()

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setName(u.name))
      .catch(() => {})
  }, [])

  // 按权限过滤：仅显示有 VIEW 权限的模块（权限加载中先全显，避免闪烁；管理员的 can 恒为 true）
  const entries = ENTRIES.filter((e) => {
    const res = PATH_TO_RESOURCE[e.href.replace(/^\//, '')]
    return permLoading || !res || can(res, 'VIEW')
  })

  return (
    <div className="overflow-y-auto">
      {/* 欢迎横幅 */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#0369A1] px-8 py-7 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5" />
        <h1 className="text-2xl font-bold">{name ? `${name}，欢迎回来 👋` : '欢迎回来 👋'}</h1>
        <p className="mt-1.5 text-white/70">从下方选择一个模块开始今天的工作</p>
      </div>

      {/* 模块入口（按权限显示）*/}
      {!permLoading && entries.length === 0 ? (
        <div className="rounded-xl border border-base-300 bg-base-100 p-12 text-center text-base-content/50">
          暂无可访问的模块，请联系管理员为你分配权限
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="group flex items-start gap-4 rounded-xl border border-base-300 bg-base-100 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${e.tint}`}>
                <e.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-semibold text-base-content">
                  {e.label}
                  <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                <div className="mt-1 text-sm text-base-content/50">{e.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
