/**
 * 单元测试：AlignmentCalculator（纯静态算法，无 Pinia 依赖）
 * 覆盖：无参考元素 / X轴吸附 / Y轴吸附 / 超出阈值不吸附
 */
import { describe, it, expect } from 'vitest'
import { AlignmentCalculator } from '@/cores/algorithms/spatial/AlignmentCalculator'
import type { ElementGeometry } from '@/cores/types/geometry'
import type { AnyElement } from '@/cores/types/element'

// ── 辅助工厂 ──────────────────────────────────────────
function makeGeometry(overrides: Partial<ElementGeometry> = {}): ElementGeometry {
  return {
    id: 'target',
    type: 'rect',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    ...overrides,
  }
}

function makeRefElement(id: string, x: number, y: number, width = 100, height = 100): AnyElement {
  return {
    id,
    type: 'shape',
    shapeType: 'rectangle',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fillColor: '#ccc',
    strokeWidth: 0,
    strokeColor: '#000',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as AnyElement
}

describe('AlignmentCalculator.calculate', () => {
  // ── 无参考元素时 ──────────────────────────
  it('没有参考元素时 dx=0 dy=0，辅助线为空', () => {
    const result = AlignmentCalculator.calculate(makeGeometry(), [])
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
    expect(result.verticalLines).toHaveLength(0)
    expect(result.horizontalLines).toHaveLength(0)
  })

  // ── 参考元素被过滤（parentGroup 存在）────
  it('有 parentGroup 的元素不参与对齐', () => {
    const hidden = { ...makeRefElement('child', 0, 0), parentGroup: 'gp1' }
    const result = AlignmentCalculator.calculate(makeGeometry(), [hidden])
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
  })

  // ── X 轴（垂直线）吸附 ────────────────────
  it('目标左边与参考左边对齐时产生 X 轴吸附（dx ≠ 0 or 辅助线 ≠ 空）', () => {
    // target: x=0, ref: x=5（差值5，在阈值8内）
    const target = makeGeometry({ x: 0, y: 200 })
    const ref = makeRefElement('ref1', 5, 200)

    const result = AlignmentCalculator.calculate(target, [ref], 1)
    // 产生了任意量的 X 偏移，或产生了辅助线
    const hasXSnap = result.dx !== 0 || result.verticalLines.length > 0
    expect(hasXSnap).toBe(true)
  })

  // ── Y 轴（水平线）吸附 ────────────────────
  it('目标顶边与参考顶边对齐时产生 Y 轴吸附（dy ≠ 0 or 辅助线 ≠ 空）', () => {
    // target: y=0，ref: y=6（差值6，在阈值8内）
    const target = makeGeometry({ x: 200, y: 0 })
    const ref = makeRefElement('ref2', 200, 6)

    const result = AlignmentCalculator.calculate(target, [ref], 1)
    const hasYSnap = result.dy !== 0 || result.horizontalLines.length > 0
    expect(hasYSnap).toBe(true)
  })

  // ── 超出阈值不吸附 ────────────────────────
  it('距离超出阈值时 dx=0 dy=0', () => {
    // target: x=0，ref: x=1000（距离远超阈值）
    const target = makeGeometry({ x: 0, y: 0 })
    const ref = makeRefElement('ref3', 1000, 1000)

    const result = AlignmentCalculator.calculate(target, [ref], 1)
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
  })

  // ── 缩放影响阈值 ──────────────────────────
  it('高缩放比例下逻辑阈值更小，相同偏移量不吸附', () => {
    // 在 scale=10 下，阈值 = 8/10 = 0.8px
    // 差值 5px 超出 0.8px，不应吸附
    const target = makeGeometry({ x: 0, y: 200 })
    const ref = makeRefElement('ref4', 5, 200)

    const result = AlignmentCalculator.calculate(target, [ref], 10)
    expect(result.dx).toBe(0)
  })

  // ── 中心点对齐 ────────────────────────────
  it('目标中心与参考中心对齐时产生吸附', () => {
    // target: x=0, width=100 => center.x=50
    // ref: x=46, width=100 => center.x=96，差=46？不对，让 center 对齐
    // target center = 50, ref center = 50（ref.x=0, ref.y=300）
    const target = makeGeometry({ x: 0, y: 0 })
    // ref 中心与 target 中心相差 3（在阈值内）
    const ref = makeRefElement('ref5', 3, 300) // ref.center.x = 53

    const result = AlignmentCalculator.calculate(target, [ref], 1)
    const hasSnap = result.dx !== 0 || result.verticalLines.length > 0
    expect(hasSnap).toBe(true)
  })
})
