/**
 * 单元测试：useHistoryStore (history.ts)
 * 覆盖：pushSnapshot / undo / redo / 压缩 / beginBatch-endBatch
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHistoryStore } from '@/stores/history'
import type { AnyElement } from '@/cores/types/element'

// 辅助：生成最简 ShapeElement
function makeElement(id: string, x = 0, y = 0): AnyElement {
  return {
    id,
    type: 'shape',
    shapeType: 'rectangle',
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fillColor: '#fff',
    strokeWidth: 0,
    strokeColor: '#000',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as AnyElement
}

describe('useHistoryStore', () => {
  let store: ReturnType<typeof useHistoryStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useHistoryStore()
    // 清空状态
    store.clear()
  })

  // ── 初始状态 ──────────────────────────────
  it('初始状态：index = -1，stack 为空', () => {
    expect(store.index).toBe(-1)
    expect(store.stack).toHaveLength(0)
  })

  // ── pushSnapshot（第一条）────────────────
  it('第一次 pushSnapshot 存储完整快照（isSnapshot = true）', () => {
    const elements = [makeElement('e1')]
    store.pushSnapshot(elements, 'test')

    expect(store.stack).toHaveLength(1)
    expect(store.index).toBe(0)
    const record = store.stack[0]!
    expect(store.isSnapshot(record)).toBe(true)
  })

  // ── pushSnapshot（后续）──────────────────
  it('第二次 pushSnapshot 存储 diff 记录（isSnapshot = false）', () => {
    const e1 = makeElement('e1', 0, 0)
    store.pushSnapshot([e1], 'test')

    const e1moved = makeElement('e1', 50, 50)
    store.pushSnapshot([e1moved], 'test')

    expect(store.stack).toHaveLength(2)
    const record1 = store.stack[1]!
    expect(store.isSnapshot(record1)).toBe(false)
  })

  // ── 相同状态不重复记录 ───────────────────
  it('推入完全相同的状态时不增加记录', () => {
    const elements = [makeElement('e1')]
    store.pushSnapshot([...elements], 'test')
    store.pushSnapshot([...elements], 'test')

    expect(store.stack).toHaveLength(1)
  })

  // ── undo ──────────────────────────────────
  it('undo 回到上一状态，x 恢复为 0', () => {
    const e1 = makeElement('e1', 0, 0)
    store.pushSnapshot([e1], 'test')

    const e1moved = { ...e1, x: 50, y: 50 }
    store.pushSnapshot([e1moved], 'test')

    const result = store.undo()
    expect(result).not.toBeNull()
    expect(result!.snapshot[0].x).toBe(0)
    expect(store.index).toBe(0)
  })

  it('index 为 0 时 undo 返回 null（无法继续撤销）', () => {
    store.pushSnapshot([makeElement('e1')], 'test')
    expect(store.undo()).toBeNull()
  })

  // ── redo ──────────────────────────────────
  it('redo 恢复到下一状态，x 恢复为 50', () => {
    const e1 = makeElement('e1', 0, 0)
    store.pushSnapshot([e1], 'test')
    const e1moved = { ...e1, x: 50 }
    store.pushSnapshot([e1moved], 'test')

    store.undo()
    const result = store.redo()
    expect(result).not.toBeNull()
    expect(result!.snapshot[0].x).toBe(50)
  })

  it('已在最新状态时 redo 返回 null', () => {
    store.pushSnapshot([makeElement('e1')], 'test')
    expect(store.redo()).toBeNull()
  })

  // ── undo 后 push 截断未来记录 ─────────────
  it('undo 后 push 新快照，截断后续记录', () => {
    const e1 = makeElement('e1', 0, 0)
    store.pushSnapshot([e1], 'test')
    store.pushSnapshot([{ ...e1, x: 50 }], 'test')
    store.undo()
    store.pushSnapshot([{ ...e1, x: 99 }], 'test')

    expect(store.stack).toHaveLength(2)
    expect(store.index).toBe(1)
  })

  // ── 历史压缩 ──────────────────────────────
  it('超过 compressThreshold 时触发压缩，stack 显著缩短', () => {
    // compressThreshold 默认 50，我们推 55 条
    let currentEl = makeElement('e1', 0, 0)
    store.pushSnapshot([currentEl], 'test')

    for (let i = 1; i <= 55; i++) {
      currentEl = { ...currentEl, x: i }
      store.pushSnapshot([currentEl], 'test')
    }

    // 压缩后 stack 长度应小于 55
    expect(store.stack.length).toBeLessThan(55)
    // 当前快照 x 值应为最后一次 push 的值（55）
    const current = store.getCurrent()
    expect(current?.[0].x).toBe(55)
  })

  // ── beginBatch / endBatch ────────────────
  it('beginBatch / endBatch 内的多次 push 合并为 1 条记录', () => {
    const e1 = makeElement('e1', 0, 0)
    store.pushSnapshot([e1], 'test')     // index = 0

    store.beginBatch()
    // 批次内的 push 不立即入栈
    store.pushSnapshot([{ ...e1, x: 10 }], 'test')
    store.pushSnapshot([{ ...e1, x: 20 }], 'test')
    expect(store.stack).toHaveLength(1) // 还未入栈

    store.endBatch()
    // endBatch 后只合并为 1 条
    expect(store.stack).toHaveLength(2)
    expect(store.index).toBe(1)
  })
})
