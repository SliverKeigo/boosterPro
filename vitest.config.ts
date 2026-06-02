import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

// 默认 node 环境（lib / API 路由测试）。
// 组件 / hook 测试在文件顶部加 `// @vitest-environment jsdom` 切换到 jsdom。
export default defineConfig({
  plugins: [react()],
  resolve: {
    // 显式 @/ → src/ 别名（不依赖 tsconfig include，测试目录被排除也能解析）。
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
})
