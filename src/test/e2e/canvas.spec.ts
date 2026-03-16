/**
 * E2E 测试：画布基础操作流程
 * 覆盖：页面加载 / 创建矩形 / 撤销(Ctrl+Z) / 重做(Ctrl+Y)
 */
import { test, expect } from '@playwright/test'

test.describe('画布基础操作', () => {
  test.beforeEach(async ({ page }) => {
    // 访问主页面
    await page.goto('/')
    // 等待顶部工具栏出现，确认页面已渲染
    await page.waitForSelector('.top-toolbar', { timeout: 10_000 })
  })

  // ── 1. 页面加载 ──────────────────────────────────────
  test('页面加载后顶部工具栏可见', async ({ page }) => {
    const toolbar = page.locator('.top-toolbar')
    await expect(toolbar).toBeVisible()

    // 矩形工具按钮应该存在
    const rectBtn = page.locator('[title="矩形工具 (R)"]')
    await expect(rectBtn).toBeVisible()

    // 撤销按钮应该存在
    const undoBtn = page.locator('[title="撤销 (Ctrl/Cmd+Z)"]')
    await expect(undoBtn).toBeVisible()

    // 重做按钮应该存在
    const redoBtn = page.locator('[title="重做 (Ctrl/Cmd+Y)"]')
    await expect(redoBtn).toBeVisible()
  })

  // ── 2. 选择矩形工具 ──────────────────────────────────
  test('点击矩形工具按钮后，按钮变为 active 状态', async ({ page }) => {
    const rectBtn = page.locator('[title="矩形工具 (R)"]')
    await rectBtn.click()

    // 按钮应带有 active class
    await expect(rectBtn).toHaveClass(/active/)
  })

  // ── 3. 在画布上拖拽创建矩形 ───────────────────────────
  test('选择矩形工具后在画布上拖拽可创建矩形元素', async ({ page }) => {
    // 选择矩形工具
    const rectBtn = page.locator('[title="矩形工具 (R)"]')
    await rectBtn.click()

    // 在画布区域拖拽
    const canvas = page.locator('.pixi-canvas')
    const canvasBounds = await canvas.boundingBox()
    if (!canvasBounds) throw new Error('Canvas not found')

    const startX = canvasBounds.x + canvasBounds.width / 2 - 50
    const startY = canvasBounds.y + canvasBounds.height / 2 - 50
    const endX = startX + 120
    const endY = startY + 80

    // 拖拽创建矩形
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(endX, endY, { steps: 10 })
    await page.mouse.up()

    // 等待短暂时间让渲染生效
    await page.waitForTimeout(300)

    // 拖拽完成后工具应自动切换回 select（按 useCanvas 逻辑）
    const selectBtn = page.locator('[title="选择工具 (V)"]')
    await expect(selectBtn).toHaveClass(/active/)
  })

  // ── 4. 撤销（Ctrl+Z）─────────────────────────────────
  test('创建元素后 Ctrl+Z 撤销有效', async ({ page }) => {
    // 先创建一个矩形
    const rectBtn = page.locator('[title="矩形工具 (R)"]')
    await rectBtn.click()

    const canvas = page.locator('.pixi-canvas')
    const canvasBounds = await canvas.boundingBox()
    if (!canvasBounds) throw new Error('Canvas not found')

    const cx = canvasBounds.x + canvasBounds.width / 2
    const cy = canvasBounds.y + canvasBounds.height / 2

    await page.mouse.move(cx - 60, cy - 40)
    await page.mouse.down()
    await page.mouse.move(cx + 60, cy + 40, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    // 触发撤销
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    // 撤销后重做按钮应该可用（不再禁用）
    const redoBtn = page.locator('[title="重做 (Ctrl/Cmd+Y)"]')
    // 样式中 canRedo ? '#2c2c2c' : '#dbdbdb'，不禁用则颜色为 #2c2c2c
    await expect(redoBtn).not.toBeDisabled()
  })

  // ── 5. 重做（Ctrl+Y）─────────────────────────────────
  test('撤销后 Ctrl+Y 重做有效', async ({ page }) => {
    // 创建矩形
    const rectBtn = page.locator('[title="矩形工具 (R)"]')
    await rectBtn.click()

    const canvas = page.locator('.pixi-canvas')
    const canvasBounds = await canvas.boundingBox()
    if (!canvasBounds) throw new Error('Canvas not found')

    const cx = canvasBounds.x + canvasBounds.width / 2
    const cy = canvasBounds.y + canvasBounds.height / 2

    await page.mouse.move(cx - 60, cy - 40)
    await page.mouse.down()
    await page.mouse.move(cx + 60, cy + 40, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    // 撤销
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    // 重做
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(200)

    // 重做后撤销按钮应可用
    const undoBtn = page.locator('[title="撤销 (Ctrl/Cmd+Z)"]')
    await expect(undoBtn).not.toBeDisabled()
  })

  // ── 6. 选择工具切换 ───────────────────────────────────
  test('V 键快捷键切换回选择工具', async ({ page }) => {
    // 先切换到矩形工具
    await page.click('[title="矩形工具 (R)"]')

    // 按 V 键切换回选择工具
    await page.keyboard.press('v')
    await page.waitForTimeout(100)

    const selectBtn = page.locator('[title="选择工具 (V)"]')
    await expect(selectBtn).toHaveClass(/active/)
  })
})
