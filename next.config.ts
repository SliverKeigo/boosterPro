import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 允许局域网其它设备访问 dev server 的 HMR 等内部资源（仅开发期生效，不影响生产构建）。
  // 精确 IP + 同网段通配（末段 *），机器 IP 在 192.168.31.x 内变动也无需再改；
  // 换了网段（如 192.168.1.x）就把对应 IP / 通配加到下面。
  allowedDevOrigins: ['192.168.31.208', '192.168.31.*'],
  transpilePackages: ['echarts', 'echarts-for-react'],
  experimental: {
    // 中间件 matcher 为 catch-all，/api/upload 也走代理；
    // Next 16 默认只缓冲代理请求体的前 10MB，会截断大文件上传。
    // 上传路由自身限制为 50MB，这里设 60MB 留出 multipart 编码余量。
    proxyClientMaxBodySize: '60mb',
  },
}

export default nextConfig
