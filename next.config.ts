import type { NextConfig } from 'next'
import pkg from './package.json'

const nextConfig: NextConfig = {
  // 构建期注入版本信息（侧边栏 Logo 下的小字）：版本号来自 package.json；
  // 短 commit hash 来自 CI 的 GITHUB_SHA（本地 dev/build 无此变量则只显示版本号）。
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.GITHUB_SHA ?? '').slice(0, 7),
  },
  // 允许局域网其它设备访问 dev server 的 HMR 等内部资源（仅开发期生效，不影响生产构建）。
  // 精确 IP + 同网段通配（末段 *），机器 IP 在 192.168.31.x 内变动也无需再改；
  // 换了网段（如 192.168.1.x）就把对应 IP / 通配加到下面。
  allowedDevOrigins: ['192.168.31.208', '192.168.31.*'],
  transpilePackages: ['echarts', 'echarts-for-react'],
  experimental: {
    // 中间件 matcher 为 catch-all，上传/导入都走代理；
    // Next 16 默认只缓冲代理请求体的前 10MB，会截断大文件上传。
    // 「封存包」含附件资源，单包可达上百 MB（如客户包 ~128MB），故放宽到 300MB；
    // 表单附件单文件仍由上传路由自身限制（50MB）。
    proxyClientMaxBodySize: '300mb',
    // 中间件是 catch-all → 所有请求走 Next 代理层，其默认超时仅 30s，大封存包(上百 MB)上传会被掐断；
    // 放宽到 10min。注：实际上限还受 Node http server requestTimeout(默认 ~300s)约束——
    // 上行过慢导致 128MB 传输 >300s 时仍会撞，那种情况需改自定义 server 放开 requestTimeout。
    proxyTimeout: 600000,
  },
}

export default nextConfig
