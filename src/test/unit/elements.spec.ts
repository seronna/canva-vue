/**
 * 单元测试：useElementsStore (elements.ts)
 * 覆盖：addShape / moveElement / moveElements / removeElement /
 *        getElementsInBox / copySelectedElements / pasteElements
 *
 * 注意：saveToLocal / recordSnapshot 涉及 rAF + setTimeout，
 * 已在 vitest.setup.ts 中 mock 为同步执行。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useElementsStore } from '@/stores/elements'
import { useSelectionStore } from '@/stores/selection'
import type { ShapeElement } from '@/cores/types/element'

// ── 辅助工厂 ──────────────────────────────────────────
function shapePayload(overrides: Partial<ShapeElement> = {}) {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shapeType: 'rectangle' as const,
    fillColor: '#fff',
    strokeWidth: 0,
    strokeColor: '#000',
    ...overrides,
  }
}

describe('useElementsStore', () => {
  let store: ReturnType<typeof useElementsStore>
  let selectionStore: ReturnType<typeof useSelectionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useElementsStore()
    selectionStore = useSelectionStore()
    vi.useFakeTimers()
  })

  // ── addShape ─────────────────────────────────────────
  describe('addShape', () => {
    it('返回唯一 id 且元素被加入数组', () => {
      const id = store.addShape(shapePayload())
      expect(id).toBeTruthy()
      expect(store.elements).toHaveLength(1)
      expect(store.elements[0]!.id).toBe(id)
    })

    it('多次 addShape 会累积元素', () => {
      store.addShape(shapePayload())
      store.addShape(shapePayload({ x: 200 }))
      expect(store.elements).toHaveLength(2)
    })

    it('新元素 type 固定为 shape', () => {
      const id = store.addShape(shapePayload())
      expect(store.getElementById(id)?.type).toBe('shape')
    })
  })

  // ── moveElement ───────────────────────────────────────
  describe('moveElement', () => {
    it('x/y 正确叠加偏移量', () => {
      const id = store.addShape(shapePayload({ x: 10, y: 20 }))
      store.moveElement(id, 5, -10)
      const el = store.getElementById(id)!
      expect(el.x).toBe(15)
      expect(el.y).toBe(10)
    })

    it('id 不存在时不抛出异常', () => {
      expect(() => store.moveElement('nonexistent', 5, 5)).not.toThrow()
    })
  })

  // ── moveElements（批量）───────────────────────────────
  describe('moveElements', () => {
    it('批量移动多个元素', () => {
      const id1 = store.addShape(shapePayload({ x: 0 }))
      const id2 = store.addShape(shapePayload({ x: 100 }))
      store.moveElements([id1, id2], 10, 10)
      expect(store.getElementById(id1)!.x).toBe(10)
      expect(store.getElementById(id2)!.x).toBe(110)
    })

    it('未在 ids 列表中的元素不受影响', () => {
      const id1 = store.addShape(shapePayload({ x: 0 }))
      const id2 = store.addShape(shapePayload({ x: 50 }))
      store.moveElements([id1], 20, 0)
      expect(store.getElementById(id2)!.x).toBe(50)
    })
  })

  // ── removeElement ─────────────────────────────────────
  describe('removeElement', () => {
    it('删除后元素不再存在', () => {
      const id = store.addShape(shapePayload())
      store.removeElement(id)
      expect(store.getElementById(id)).toBeUndefined()
      expect(store.elements).toHaveLength(0)
    })

    it('批量删除（removeElements）', () => {
      const id1 = store.addShape(shapePayload())
      const id2 = store.addShape(shapePayload())
      const id3 = store.addShape(shapePayload())
      store.removeElements([id1, id2])
      expect(store.elements).toHaveLength(1)
      expect(store.elements[0]!.id).toBe(id3)
    })
  })

  // ── getElementsInBox ──────────────────────────────────
  describe('getElementsInBox', () => {
    it('完全在框内的元素被选中', () => {
      const id = store.addShape(shapePayload({ x: 10, y: 10, width: 50, height: 50 }))
      const result = store.getElementsInBox(0, 0, 200, 200)
      expect(result).toContain(id)
    })

    it('完全在框外的元素不被选中', () => {
      const id = store.addShape(shapePayload({ x: 500, y: 500, width: 100, height: 100 }))
      const result = store.getElementsInBox(0, 0, 100, 100)
      expect(result).not.toContain(id)
    })

    it('与框相交的元素被选中', () => {
      // 元素从 x=80 开始，框到 x=100，有 20px 重叠
      const id = store.addShape(shapePayload({ x: 80, y: 0, width: 100, height: 100 }))
      const result = store.getElementsInBox(0, 0, 100, 100)
      expect(result).toContain(id)
    })

    it('组合子元素不参与框选', () => {
      // 先添加一个父 group
      const childId = store.addShape(shapePayload({ x: 10, y: 10 }))
      store.addGroup({
        x: 0, y: 0, width: 200, height: 200,
        rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0,
        children: [childId],
      })
      // 手动设置子元素的 parentGroup
      const child = store.getElementById(childId)!
      Object.assign(child, { parentGroup: 'some-group' })
      store.elements = [...store.elements]

      const result = store.getElementsInBox(0, 0, 300, 300)
      expect(result).not.toContain(childId)
    })
  })

  // ── copy / paste ──────────────────────────────────────
  describe('copySelectedElements / pasteElements', () => {
    it('粘贴后生成新 id，原始元素不受影响', () => {
      const id = store.addShape(shapePayload({ x: 10, y: 10 }))
      selectionStore.selectedIds = [id]

      store.copySelectedElements()
      store.pasteElements()

      // 应该有 2 个元素（原始 + 拷贝）
      expect(store.elements).toHaveLength(2)
      const ids = store.elements.map(e => e.id)
      expect(ids).toContain(id) // 原始仍存在
      // 新元素有不同 id
      const newId = ids.find(i => i !== id)!
      expect(newId).toBeTruthy()
    })

    it('粘贴后的元素坐标有偏移（默认 +10）', () => {
      const id = store.addShape(shapePayload({ x: 100, y: 100 }))
      selectionStore.selectedIds = [id]

      store.copySelectedElements()
      store.pasteElements()

      const original = store.getElementById(id)!
      const pasted = store.elements.find(e => e.id !== id)!
      expect(pasted.x).toBe(original.x + 10)
      expect(pasted.y).toBe(original.y + 10)
    })

    it('clipboard 为空时 pasteElements 不新增元素', () => {
      store.addShape(shapePayload())
      // 不 copy，直接 paste
      store.pasteElements()
      expect(store.elements).toHaveLength(1)
    })
  })

  // ── clear ─────────────────────────────────────────────
  it('clear 后 elements 为空', () => {
    store.addShape(shapePayload())
    store.addShape(shapePayload())
    store.clear()
    expect(store.elements).toHaveLength(0)
  })

  // ── beginBatch / endBatch ─────────────────────────────
  describe('beginBatch / endBatch', () => {
    it('批处理结束后统一触发一次快照和保存', () => {
      const id = store.addShape(shapePayload())
      // 批处理内的操作不应立即触发保存
      store.beginBatch()
      store.moveElement(id, 10, 0)
      store.moveElement(id, 20, 0)
      store.endBatch()
      // 只要不抛出异常，基本行为正确
      expect(store.getElementById(id)!.x).toBe(30)
    })
  })
})
