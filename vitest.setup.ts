import '@testing-library/jest-dom/vitest'

// auth.ts 在 import 时若无 JWT_SECRET 会抛错；测试统一注入。
process.env.JWT_SECRET ||= 'test-jwt-secret'
