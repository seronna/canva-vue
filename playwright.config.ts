import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/test/e2e',
  // E2E 测试超时
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  // 失败时自动重试一次（CI 环境下网络波动）
  retries: process.env.CI ? 1 : 0,
  // 并发 worker 数量
  workers: process.env.CI ? 1 : undefined,
  // 生成 HTML 报告
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    // 开发服务器地址
    baseURL: 'http://localhost:5173',
    // 失败时截图
    screenshot: 'only-on-failure',
    // 失败时录屏
    video: 'retain-on-failure',
    // 关闭 headless 方便调试（CI 开启）
    headless: true,
    // 视口大小
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 在运行测试前自动启动开发服务器
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
