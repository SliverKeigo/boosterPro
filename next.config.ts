import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['echarts', 'echarts-for-react'],
  experimental: {
    // 中间件 matcher 为 catch-all，/api/upload 也走代理；
    // Next 16 默认只缓冲代理请求体的前 10MB，会截断大文件上传。
    // 上传路由自身限制为 50MB，这里设 60MB 留出 multipart 编码余量。
    proxyClientMaxBodySize: '60mb',
  },
}

export default nextConfig
