/**
 * Vitest 全局测试初始化
 * 在每个测试文件执行前运行
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

// 每个测试用例前重置 Pinia 实例，避免状态污染
beforeEach(() => {
  setActivePinia(createPinia())
})

// Mock localStorage（jsdom 已提供，但确保可写入）
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// Mock requestAnimationFrame / cancelAnimationFrame
let rafId = 0
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafId++
  cb(0)
  return rafId
})
vi.stubGlobal('cancelAnimationFrame', vi.fn())

// Mock requestIdleCallback（jsdom 不支持）
vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
  cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline)
  return 1
})
