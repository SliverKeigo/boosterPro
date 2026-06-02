import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Live E2E：打真实 dev server + 真库。与单元测试(vitest.config.ts)分开。
// 跑法：先确保 dev server 在跑(默认 http://localhost:3000)，再 `npm run test:e2e`。
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60000, // dev 模式首次访问某路由会现编译，给足超时
    hookTimeout: 60000,
    fileParallelism: false, // 文件串行，避免对单一 dev server / 同一库的并发干扰
  },
})
