'use client'

import { useState, type FormEvent } from 'react'
import { User, Lock, Eye, EyeOff, AlertCircle, Check } from 'lucide-react'
import './login.css'

// 品牌标识：圆角方块 + 向上箭头(boost)，浅色(玻璃背景)版
function BrandMark({ size = 32 }: { size?: number }) {
  // 公司 logo（步思特咨询，圆形图案，public/logo-icon.png）
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-icon.png" alt="" width={size} height={size} style={{ objectFit: 'contain' }} aria-hidden="true" />
}

export default function LoginPage() {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [errKey, setErrKey] = useState(0) // 每次报错 +1，强制重挂横幅以重放抖动动画
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [touched, setTouched] = useState(false)

  const acctEmpty = touched && !account.trim()
  const pwEmpty = touched && !password
  const loading = status === 'loading'

  const fail = (msg: string) => {
    setStatus('idle')
    setError(msg)
    setErrKey((k) => k + 1)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!account.trim() || !password) {
      fail('请输入账号和密码')
      return
    }
    setError('')
    setStatus('loading')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.trim(), password, remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        fail(data.error || '账号或密码错误，请重试')
        return
      }
      setStatus('success')
      // 整页跳转进入工作台：生产构建下 router.push+refresh 跨布局(login→dashboard)导航偶发卡在登录页不跳，
      // 改用浏览器级跳转更稳——必带刚设置的登录 Cookie，由中间件 + 服务端以最新登录态渲染。
      window.location.replace('/')
    } catch {
      fail('网络错误，请重试')
    }
  }

  return (
    <div className="vc-stage">
      {/* 全屏背景：渐变 + 光晕球 + 网格 */}
      <div className="vc-bg" aria-hidden="true">
        <span className="vc-orb vc-orb-1" />
        <span className="vc-orb vc-orb-2" />
        <span className="vc-grid" />
      </div>

      {/* 左上品牌 */}
      <div className="vc-brandbar">
        <BrandMark size={32} />
        <span>BoosterPro</span>
      </div>

      {/* 玻璃浮层卡片 */}
      <div className="vc-card">
        {status === 'success' && (
          <div className="bp-success">
            <div className="bp-success-badge">
              <Check size={28} strokeWidth={2.4} />
            </div>
            <h3>登录成功</h3>
            <p>正在进入工作台…</p>
          </div>
        )}

        <h1 className="vc-title">登录</h1>

        <form className="bp-form bp-form--glass" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="bp-error" role="alert" key={errKey}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* 账号 */}
          <div className="bp-field">
            <label className="bp-label" htmlFor="login-account">账号</label>
            <div className={'bp-input-wrap' + (acctEmpty ? ' is-invalid' : '')}>
              <span className="bp-input-icon"><User size={18} /></span>
              <input
                id="login-account"
                className="bp-input"
                type="text"
                autoComplete="username"
                placeholder="请输入账号"
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value)
                  if (error) setError('')
                }}
              />
            </div>
            {acctEmpty && <span className="bp-field-msg">请输入账号</span>}
          </div>

          {/* 密码 */}
          <div className="bp-field">
            <label className="bp-label" htmlFor="login-password">密码</label>
            <div className={'bp-input-wrap' + (pwEmpty ? ' is-invalid' : '')}>
              <span className="bp-input-icon"><Lock size={18} /></span>
              <input
                id="login-password"
                className="bp-input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
              />
              <button
                type="button"
                className="bp-eye"
                tabIndex={-1}
                aria-label={showPw ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {pwEmpty && <span className="bp-field-msg">请输入密码</span>}
          </div>

          {/* 记住我 */}
          <div className="bp-remember">
            <label className="bp-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="bp-check-box">
                <Check className="bp-check-tick" strokeWidth={3} />
              </span>
              <span>记住我</span>
            </label>
          </div>

          {/* 登录按钮 */}
          <button
            type="submit"
            className={'bp-btn' + (loading ? ' is-loading' : '')}
            disabled={loading}
          >
            {loading && <span className="bp-spinner" />}
            <span>{loading ? '登录中…' : '登 录'}</span>
          </button>
        </form>
      </div>

      <footer className="vc-foot">© 2026 BoosterPro · 企业内部系统</footer>
    </div>
  )
}
