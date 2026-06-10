'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Users,
  FileText,
  FilePlus,
  LayoutDashboard,
  UsersRound,
  Target,
  Building2,
  FileSignature,
  BookOpen,
  Settings,
  User,
  Network,
  Users2,
  ShieldCheck,
  Lock,
  Share2,
  BookMarked,
  LogOut,
  ChevronDown,
  Briefcase,
  ClipboardList,
  Sparkles,
  Zap,
  BarChart3,
  Contact,
  type LucideIcon,
} from 'lucide-react'
import { Popconfirm, useToast } from '@/components/ui'
import { useMyPermissions, clearPermissionCache } from '@/lib/usePermissions'
import { clearRefCache } from '@/lib/refCache'
import { clearDictCache } from '@/lib/useDict'
import { PATH_TO_RESOURCE } from '@/lib/resources'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}
interface NavGroup {
  key: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    key: 'delivery',
    label: '交付中心',
    icon: Briefcase,
    items: [
      { href: '/candidates', label: '候选人管理', icon: Users },
      { href: '/requirements', label: '客户需求管理', icon: FileText },
      { href: '/supplements', label: '客户补充信息', icon: FilePlus },
      { href: '/talent-pool', label: '人才储备库', icon: UsersRound },
      { href: '/work-plans', label: '工作计划', icon: ClipboardList },
    ],
  },
  {
    key: 'analytics',
    label: '数据分析',
    icon: BarChart3,
    items: [
      { href: '/reports/candidate-recommendation', label: '候选人推荐报表', icon: BarChart3 },
    ],
  },
  {
    key: 'sales',
    label: '市场中心',
    icon: Target,
    items: [
      { href: '/opportunities', label: '商机管理', icon: Target },
      { href: '/clients', label: '客户基本信息', icon: Building2 },
      { href: '/customer-contacts', label: '客户联系人信息', icon: Contact },
      { href: '/contracts', label: '销售合同', icon: FileSignature },
    ],
  },
  {
    key: 'common',
    label: '公司通用',
    icon: LayoutDashboard,
    items: [
      { href: '/knowledge', label: '公司知识库', icon: BookOpen },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    icon: Settings,
    items: [
      { href: '/settings/users', label: '用户管理', icon: User },
      { href: '/settings/departments', label: '部门管理', icon: Network },
      { href: '/settings/groups', label: '组管理', icon: Users2 },
      { href: '/settings/roles', label: '角色管理', icon: ShieldCheck },
      { href: '/settings/permissions', label: '权限设置', icon: Lock },
      { href: '/settings/data-grants', label: '数据共享', icon: Share2 },
      { href: '/settings/dictionaries', label: '字典管理', icon: BookMarked },
      { href: '/settings/ai-prompts', label: '提示词管理', icon: Sparkles },
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap((g) => g.items)

interface CurrentUser {
  id: number
  name: string
  email: string | null
  department: { name: string } | null
  role?: { name: string } | null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [openKeys, setOpenKeys] = useState<string[]>(GROUPS.map((g) => g.key))

  const { can, isAdmin, loading: permLoading } = useMyPermissions()

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) setUser(await res.json())
      else router.push('/login')
    } catch {
      /* ignore */
    }
  }, [router])

  useEffect(() => {
    // IIFE：effect 同步路径不直接含 setState（规避 react-hooks/set-state-in-effect）
    void (async () => {
      await fetchUser()
    })()
  }, [fetchUser])

  // 菜单按权限过滤：八个业务菜单看 VIEW 权限，系统管理组限管理员；权限加载中先全显，避免闪烁
  const canSeeItem = (item: NavItem) => {
    // 按首段路径查资源，子路由（如 /reports/candidate-recommendation）继承父级 VIEW 权限
    const res = PATH_TO_RESOURCE[item.href.replace(/^\//, '').split('/')[0]]
    if (res) return permLoading || can(res, 'VIEW')
    return true
  }
  const canSeeGroup = (group: NavGroup) => {
    if (group.key === 'system') return permLoading || isAdmin
    return group.items.some(canSeeItem)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // 清空所有模块级缓存，避免同一浏览器换账号登录后沿用上一用户的数据：
    // 权限缓存 + 引用下拉缓存(refCache，/api/users 等含 PII，响应随权限而异) + 字典缓存。
    clearPermissionCache()
    clearRefCache()
    clearDictCache()
    toast.success('已退出登录')
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const pageTitle = pathname === '/' ? '工作台' : (ALL_ITEMS.find((i) => isActive(i.href))?.label ?? '')
  const toggleGroup = (k: string) =>
    setOpenKeys((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))

  return (
    <div className="flex min-h-screen">
      {/* ── 侧边栏 ── */}
      <aside className="bp-sidebar-scroll fixed left-0 top-0 bottom-0 z-40 flex w-60 flex-col overflow-y-auto bg-[#0F172A] text-slate-300">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-lg font-bold leading-tight tracking-wide text-white">BoosterPro</span>
            {/* 版本小字：低调灰、不抢视觉；CI 构建带短 commit hash，本地构建只有版本号 */}
            <span className="truncate text-[10px] leading-none text-slate-500">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
              {process.env.NEXT_PUBLIC_BUILD_SHA ? ` · ${process.env.NEXT_PUBLIC_BUILD_SHA}` : ''}
            </span>
          </div>
        </div>

        {/* 菜单 */}
        <nav className="flex-1 px-3 py-3">
          <Link
            href="/"
            className={`mb-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === '/'
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            工作台
          </Link>
          {GROUPS.filter(canSeeGroup).map((group) => {
            const open = openKeys.includes(group.key)
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
                >
                  <group.icon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                </button>
                {open && (
                  <ul className="mt-0.5 space-y-0.5">
                    {group.items.filter(canSeeItem).map((item) => {
                      const active = isActive(item.href)
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
                              active
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {item.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>

        {/* 底部用户卡 */}
        {user && (
          <div className="shrink-0 border-t border-white/10 p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                {user.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{user.name}</div>
                <div className="truncate text-xs text-slate-500">
                  {user.role?.name ?? user.department?.name ?? '成员'}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── 主区 ── */}
      <div className="ml-60 flex min-h-screen min-w-0 flex-1 flex-col">
        {/* 顶部栏 */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-base-300 bg-base-100/90 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/40">BoosterPro</span>
            <span className="text-base-content/30">/</span>
            <span className="font-semibold text-base-content">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <Popconfirm
                title="确认退出登录？"
                okText="退出"
                okDanger
                onConfirm={handleLogout}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm gap-2 normal-case"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {user.name.slice(0, 1)}
                  </div>
                  <span className="text-sm font-medium">{user.name}</span>
                  <LogOut className="h-4 w-4 text-base-content/40" />
                </button>
              </Popconfirm>
            )}
          </div>
        </header>

        {/* 内容 */}
        <main className="bp-page-main flex flex-1 flex-col overflow-hidden p-6">{children}</main>
      </div>
    </div>
  )
}
