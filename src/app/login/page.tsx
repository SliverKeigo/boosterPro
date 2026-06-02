'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, User, Lock, Users, Target, ShieldCheck } from 'lucide-react'
import { useToast } from '@/components/ui'

const FEATURES = [
  { icon: Users, title: '全流程候选人管理', desc: '挖猎进度、推荐状态一目了然' },
  { icon: Target, title: '商机与客户洞察', desc: 'AI 辅助分析岗位画像与对标企业' },
  { icon: ShieldCheck, title: '精细化权限控制', desc: '按部门、人员、数据多维授权' },
]

export default function LoginPage() {
  const router = useRouter()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '登录失败')
        return
      }
      toast.success('登录成功')
      router.push('/')
      router.refresh()
    } catch {
      toast.error('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── 左侧品牌区 ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex bg-[radial-gradient(125%_125%_at_0%_0%,#1E3A5F_0%,#0F172A_52%,#082F49_100%)]">
        {/* 柔光球 */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        {/* 点阵纹理 */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
            <Zap className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-wide">BoosterPro</span>
        </div>

        <div className="relative">
          <span className="mb-5 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
            一站式猎头招聘交付平台
          </span>
          <h1 className="mb-4 text-[2.1rem] font-bold leading-[1.2]">
            专业的猎头 CRM
            <br />
            <span className="bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">
              管理平台
            </span>
          </h1>
          <p className="mb-9 max-w-sm leading-relaxed text-white/60">
            从候选人挖猎到商机成交，一站式管理招聘交付全流程。
          </p>
          <div className="space-y-3.5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/30 to-indigo-500/30 ring-1 ring-white/15">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{f.title}</div>
                  <div className="mt-0.5 text-sm text-white/55">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/40">© 2026 BoosterPro · 猎头招聘管理系统</div>
      </div>

      {/* ── 右侧表单区 ── */}
      <div className="flex w-full items-center justify-center bg-base-200 p-6 lg:w-1/2">
        <div className="w-full max-w-sm rounded-2xl bg-base-100 p-8 shadow-xl ring-1 ring-base-300/60">
          {/* 移动端 Logo */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-primary">BoosterPro</span>
          </div>

          <h2 className="text-2xl font-bold text-base-content">欢迎回来 👋</h2>
          <p className="mb-7 mt-1.5 text-sm text-base-content/50">请登录您的账号以继续</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-base-content/70">账号</label>
              <label className="input input-bordered flex w-full items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-base-content/40" />
                <input
                  type="text"
                  required
                  className="grow"
                  placeholder="请输入账号"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-base-content/70">密码</label>
              <label className="input input-bordered flex w-full items-center gap-2">
                <Lock className="h-4 w-4 shrink-0 text-base-content/40" />
                <input
                  type="password"
                  required
                  className="grow"
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </div>

            <button type="submit" className="btn btn-primary mt-2 w-full" disabled={loading}>
              {loading && <span className="loading loading-spinner loading-sm" />}
              登 录
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
