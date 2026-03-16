import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    AutoImport({
      resolvers: [ArcoResolver()],
    }),
    Components({
      resolvers: [
        ArcoResolver({
          sideEffect: true
        })
      ]
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  test: {
    // 使用 jsdom 模拟浏览器环境
    environment: 'jsdom',
    // 注入全局 API（describe / it / expect / beforeEach...）
    globals: true,
    // 测试文件全局初始化
    setupFiles: ['./src/test/vitest.setup.ts'],
    // 只扫描 unit 目录，排除 e2e（Playwright 文件）
    include: ['src/test/unit/**/*.spec.ts'],
    // 路径覆盖报告
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/stores/**', 'src/cores/**', 'src/composables/**'],
    },
    // 解析 @ 别名
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
