<!--
  选中框组件 - 支持拖拽移动
  优化策略：
  1. 拖拽时直接操作 DOM transform，不触发 Vue 响应式
  2. 使用 RAF 节流，避免过度渲染
  3. 拖拽结束时才更新 Store
-->
<template>
  <div class="selection-overlay">
    <!-- 单选边框 -->
    <div
      v-if="selectedIds.length === 1 && boundingBox"
      ref="singleBoxRef"
      class="selection-box single"
      :style="{
        transform: `translate3d(${boundingBox.x}px, ${boundingBox.y}px, 0) rotate(${getSelectionRotation()}rad)`,
        transformOrigin: `${boundingBox.width / 2}px ${boundingBox.height / 2}px`,
        width: boundingBox.width + 'px',
        height: boundingBox.height + 'px'
      }"
      @mousedown="startDrag"
    >
      <!-- 四个角的控制点 -->
      <div class="resize-handle top-left" @mousedown="startResize($event, 'tl')"></div>
      <div class="resize-handle top-right" @mousedown="startResize($event, 'tr')"></div>
      <div class="resize-handle bottom-left" @mousedown="startResize($event, 'bl')"></div>
      <div class="resize-handle bottom-right" @mousedown="startResize($event, 'br')"></div>
      <div class="rotate-handle" @mousedown="startRotate($event)"></div>
    </div>

    <!-- 多选边框 - 可拖拽 -->
    <div
      v-if="selectedIds.length > 1 && boundingBox"
      ref="multiBoxRef"
      class="selection-box multi draggable"
      :style="{
        transform: `translate3d(${boundingBox.x}px, ${boundingBox.y}px, 0)`,
        width: boundingBox.width + 'px',
        height: boundingBox.height + 'px'
      }"
      @mousedown="startDrag"
    >
      <!-- 四个角的控制点 -->
      <div class="resize-handle top-left" @mousedown="startResize($event, 'tl')"></div>
      <div class="resize-handle top-right" @mousedown="startResize($event, 'tr')"></div>
      <div class="resize-handle bottom-left" @mousedown="startResize($event, 'bl')"></div>
      <div class="resize-handle bottom-right" @mousedown="startResize($event, 'br')"></div>
      <div class="rotate-handle" @mousedown="startRotate($event)"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, inject, onUnmounted } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import { useElementsStore } from '@/stores/elements'
import { useCanvasStore } from '@/stores/canvas'
import { useDragSync } from '@/composables/useDragSync'
import { useDragState } from '@/composables/useDragState'
import { CoordinateTransform } from '@/cores/viewport/CoordinateTransform'
import type { CanvasService } from '@/services/canvas/CanvasService'
import { useAlignment } from '@/composables/useAlignment'

const selectionStore = useSelectionStore()
const elementsStore = useElementsStore()
const canvasStore = useCanvasStore()

// 注入 canvasService
const canvasService = inject<CanvasService>('canvasService')
const { syncDragPosition } = canvasService ? useDragSync(canvasService) : { syncDragPosition: () => {} }
const { getDragState, startDrag: startGlobalDrag, updateDragOffset: updateGlobalDragOffset, endDrag: endGlobalDrag } = useDragState()
const { checkAlignment, clearAlignment } = useAlignment()

const selectedIds = computed(() => selectionStore.selectedIds)
const isDragging = ref(false)
const isResizing = ref(false)
const isRotating = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 })
const rotateStart = ref({ x: 0, y: 0, angle: 0 })
const resizeHandle = ref('')
const totalOffset = ref({ x: 0, y: 0 }) // 累计拖拽偏移量
const rotationAngle = ref(0)
const singleBoxRef = ref<HTMLElement>()
const multiBoxRef = ref<HTMLElement>()
let animationFrameId: number | null = null

// 使用 ref 缓存边界框，避免频繁计算
const cachedBoundingBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)

// 计算选中元素的组合边界框
const calculateBoundingBox = () => {
  if (selectedIds.value.length === 0) return null

  // 展开组合元素：使用其子元素参与边界框计算
  const selectedElements = selectedIds.value.flatMap(id => {
    const el = elementsStore.getElementById(id)
    if (!el) return []

    if (el.type === 'group' && 'children' in el && Array.isArray(el.children)) {
      const children = el.children
        .map(childId => elementsStore.getElementById(childId))
        .filter(child => child != null)
      // 如果组合没有有效子元素，退回到组合自身
      return children.length > 0 ? children : [el]
    }

    return [el]
  })

  if (selectedElements.length === 0) return null

  // 计算所有选中元素的组合边界
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  selectedElements.forEach(el => {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

// 监听选中元素变化，同步更新边界框缓存
watch(
  () => selectedIds.value.map(id => {
    const el = elementsStore.getElementById(id)
    return el ? `${el.x},${el.y},${el.width},${el.height},${el.rotation || 0}` : ''
  }).join('|'),
  () => {
    cachedBoundingBox.value = calculateBoundingBox()
  },
  { immediate: true }
)

// 监听视口变化，触发边界框重新计算（确保坐标转换使用最新的视口状态）
watch(
  () => canvasStore.viewport,
  () => {
    // 视口变化时，边界框的屏幕坐标会自动通过 computed 重新计算
    // 这里只需要触发一次更新即可
  },
  { deep: true }
)

// 实际显示的边界框（世界坐标，拖拽时应用全局偏移）
const worldBoundingBox = computed(() => {
  const dragState = getDragState().value

  // 如果正在拖拽且拖拽的元素包含当前选中的元素
  if (dragState) {
    const isDraggingSelected = dragState.elementIds.some(id => selectedIds.value.includes(id))
    if (isDraggingSelected) {
      // 优先使用全局拖拽状态中的初始边界框（避免 watch 延迟问题）
      const baseBox = dragState.initialBoundingBox || cachedBoundingBox.value
      if (baseBox) {
        return {
          x: baseBox.x + dragState.offset.x,
          y: baseBox.y + dragState.offset.y,
          width: baseBox.width,
          height: baseBox.height
        }
      }
    }
  }

  return cachedBoundingBox.value
})

// Get rotation for selection box
const getSelectionRotation = () => {
  if (selectedIds.value.length === 1 && selectedIds.value[0]) {
    const el = elementsStore.getElementById(selectedIds.value[0])
    return el?.rotation || 0
  }
  return 0
}
// 转换为屏幕坐标的边界框（用于CSS渲染）
const boundingBox = computed(() => {
  if (!worldBoundingBox.value) return null

  const viewport = canvasStore.viewport
  const canvasWidth = canvasStore.width || 800
  const canvasHeight = canvasStore.height || 600

  // 将世界坐标的左上角转换为屏幕坐标
  const topLeft = CoordinateTransform.worldToScreen(
    worldBoundingBox.value.x,
    worldBoundingBox.value.y,
    viewport,
    canvasWidth,
    canvasHeight
  )

  // 计算缩放后的尺寸
  const screenWidth = worldBoundingBox.value.width * viewport.zoom
  const screenHeight = worldBoundingBox.value.height * viewport.zoom

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: screenWidth,
    height: screenHeight
  }
})

// 开始拖拽
const startDrag = (event: MouseEvent) => {
  if (selectedIds.value.length === 0) return

  // 立即同步计算边界框，确保拖拽开始时位置正确
  cachedBoundingBox.value = calculateBoundingBox()

  isDragging.value = true
  dragStartPos.value = { x: event.clientX, y: event.clientY }
  totalOffset.value = { x: 0, y: 0 }

  // 通知全局拖拽状态
  startGlobalDrag(selectedIds.value)

  // 添加拖拽类以启用性能优化
  const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
  if (boxRef) {
    boxRef.classList.add('dragging')
  }

  // 添加全局事件监听
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)

  // 阻止默认行为和事件冒泡
  event.preventDefault()
  event.stopPropagation()
}

// 拖拽中 - 使用 RAF 节流 + 直接 DOM 操作
const onDrag = (event: MouseEvent) => {
  if (!isDragging.value || !cachedBoundingBox.value) return

  // 计算屏幕空间的偏移量
  const screenDx = event.clientX - dragStartPos.value.x
  const screenDy = event.clientY - dragStartPos.value.y

  // 转换为世界空间的偏移量（考虑缩放）
  const viewport = canvasStore.viewport
  const worldDx = screenDx / viewport.zoom
  const worldDy = screenDy / viewport.zoom

  // 应用对齐吸附
  let finalDx = worldDx
  let finalDy = worldDy

  if (cachedBoundingBox.value) {
    const targetRect = {
      x: cachedBoundingBox.value.x + worldDx,
      y: cachedBoundingBox.value.y + worldDy,
      width: cachedBoundingBox.value.width,
      height: cachedBoundingBox.value.height
    }

    const { dx: snapDx, dy: snapDy } = checkAlignment(targetRect, selectedIds.value)
    finalDx += snapDx
    finalDy += snapDy
  }

  totalOffset.value = { x: finalDx, y: finalDy }

  // 立即更新全局拖拽偏移（世界坐标，包含吸附修正）
  updateGlobalDragOffset({ x: finalDx, y: finalDy })

  // 使用 RAF 节流
  if (animationFrameId !== null) {
    return // 已有待处理的帧，跳过
  }

  animationFrameId = requestAnimationFrame(() => {
    // 计算世界坐标的新位置
    const worldX = cachedBoundingBox.value!.x + totalOffset.value.x
    const worldY = cachedBoundingBox.value!.y + totalOffset.value.y

    // 转换为屏幕坐标
    const canvasWidth = canvasStore.width || 800
    const canvasHeight = canvasStore.height || 600
    const screenPos = CoordinateTransform.worldToScreen(
      worldX,
      worldY,
      viewport,
      canvasWidth,
      canvasHeight
    )

    const screenWidth = cachedBoundingBox.value!.width * viewport.zoom
    const screenHeight = cachedBoundingBox.value!.height * viewport.zoom

    // 直接更新选中框 DOM，使用 translate3d 启用 GPU 加速
    const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
    if (boxRef) {
      // For single element, preserve rotation during drag
      if (selectedIds.value.length === 1) {
        const rotation = getSelectionRotation()
        boxRef.style.transform = `translate3d(${screenPos.x}px, ${screenPos.y}px, 0) rotate(${rotation}rad)`
        boxRef.style.transformOrigin = `${screenWidth / 2}px ${screenHeight / 2}px`
      } else {
        // Multi-selection has no rotation
        boxRef.style.transform = `translate3d(${screenPos.x}px, ${screenPos.y}px, 0)`
      }
      boxRef.style.width = `${screenWidth}px`
      boxRef.style.height = `${screenHeight}px`
    }

    // 同步更新元素位置（世界坐标）
    if (selectedIds.value.length > 0) {
      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el?.type === 'image') {
          // Update DOM image element - Images use world coordinates directly
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            const elWorldX = el.x + totalOffset.value.x
            const elWorldY = el.y + totalOffset.value.y
            const rotation = el.rotation || 0
            // Images are positioned in world coordinates, no need to convert to screen
            imgEl.style.transform = `translate3d(${elWorldX}px, ${elWorldY}px, 0) rotate(${rotation}rad)`
            imgEl.style.width = `${el.width}px`
            imgEl.style.height = `${el.height}px`
          }
        }
      })
      // Update PIXI Graphics（使用世界坐标）
      if (canvasService) {
        syncDragPosition(selectedIds.value, totalOffset.value.x, totalOffset.value.y)
      }
    }

    animationFrameId = null
  })
}

// 停止拖拽 - 此时才更新 Store
const stopDrag = () => {
  if (!isDragging.value) return

  // 取消待处理的动画帧
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // 移除拖拽类
  const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
  if (boxRef) {
    boxRef.classList.remove('dragging')
  }

  // 应用最终偏移到 Store
  if ((Math.abs(totalOffset.value.x) > 1 || Math.abs(totalOffset.value.y) > 1) && selectedIds.value.length > 0) {
    // 如果选中的是组合元素，需要同时移动组合及其子元素
    const idsToMove = new Set<string>()
    selectedIds.value.forEach(id => {
      const el = elementsStore.getElementById(id)
      if (!el) return
      idsToMove.add(id)
      if (el.type === 'group' && 'children' in el && Array.isArray(el.children)) {
        el.children.forEach(childId => idsToMove.add(childId))
      }
    })

    elementsStore.moveElements(Array.from(idsToMove), totalOffset.value.x, totalOffset.value.y)
    elementsStore.saveToLocal()

    // Reset DOM image transforms after store update
    // const viewport = canvasStore.viewport
    // const canvasWidth = canvasStore.width || 800
    // const canvasHeight = canvasStore.height || 600

    requestAnimationFrame(() => {
      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el?.type === 'image') {
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            const rotation = el.rotation || 0
            // Reset to final world coordinates after drag
            imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${rotation}rad)`
            imgEl.style.width = `${el.width}px`
            imgEl.style.height = `${el.height}px`
          }
        }
      })
    })

    // 更新缓存的边界框
    cachedBoundingBox.value = calculateBoundingBox()
  }

  isDragging.value = false
  totalOffset.value = { x: 0, y: 0 }

  // 结束全局拖拽状态
  endGlobalDrag()
  clearAlignment()

  // 移除全局事件监听
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const startResize = (e: MouseEvent, handle: string) => {
  if (!cachedBoundingBox.value) return
  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = { x: e.clientX, y: e.clientY, w: cachedBoundingBox.value.width, h: cachedBoundingBox.value.height }
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
  e.stopPropagation()
}

const onResize = (e: MouseEvent) => {
  if (!isResizing.value || !cachedBoundingBox.value) return

  const viewport = canvasStore.viewport

  // 计算屏幕空间的偏移量
  const screenDx = e.clientX - resizeStart.value.x
  const screenDy = e.clientY - resizeStart.value.y

  // 转换为世界空间的偏移量
  const worldDx = screenDx / viewport.zoom
  const worldDy = screenDy / viewport.zoom

  let w = resizeStart.value.w
  let h = resizeStart.value.h

  if (resizeHandle.value.includes('r')) w += worldDx
  if (resizeHandle.value.includes('l')) w -= worldDx
  if (resizeHandle.value.includes('b')) h += worldDy
  if (resizeHandle.value.includes('t')) h -= worldDy

  const isCircle = selectedIds.value.some(id => {
    const el = elementsStore.getElementById(id)
    return el?.type === 'shape' && 'shapeType' in el && el.shapeType === 'circle'
  })
  if (selectedIds.value.length > 1 || isCircle) {
    const scaleX = w / resizeStart.value.w
    const scaleY = h / resizeStart.value.h
    const scale = Math.max(Math.abs(scaleX), Math.abs(scaleY))
    w = resizeStart.value.w * scale
    h = resizeStart.value.h * scale
  }

  if (animationFrameId) return
  animationFrameId = requestAnimationFrame(() => {
    const box = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
    if (box && cachedBoundingBox.value) {
      // 计算世界坐标的位置
      let worldX, worldY
      if (selectedIds.value.length > 1) {
        // Multi-element: center the selection box
        const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
        const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2
        worldX = centerX - w / 2
        worldY = centerY - h / 2
      } else {
        // Single element: anchor from corner
        worldX = cachedBoundingBox.value.x
        worldY = cachedBoundingBox.value.y
        if (resizeHandle.value.includes('l')) worldX += cachedBoundingBox.value.width - w
        if (resizeHandle.value.includes('t')) worldY += cachedBoundingBox.value.height - h
      }

      // 转换为屏幕坐标
      const canvasWidth = canvasStore.width || 800
      const canvasHeight = canvasStore.height || 600
      const screenPos = CoordinateTransform.worldToScreen(
        worldX,
        worldY,
        viewport,
        canvasWidth,
        canvasHeight
      )
      const screenWidth = w * viewport.zoom
      const screenHeight = h * viewport.zoom

      // Preserve rotation during resize for single element
      if (selectedIds.value.length === 1) {
        const rotation = getSelectionRotation()
        box.style.transform = `translate3d(${screenPos.x}px, ${screenPos.y}px, 0) rotate(${rotation}rad)`
        box.style.transformOrigin = `${screenWidth / 2}px ${screenHeight / 2}px`
      } else {
        box.style.transform = `translate3d(${screenPos.x}px, ${screenPos.y}px, 0)`
      }
      box.style.width = screenWidth + 'px'
      box.style.height = screenHeight + 'px'
    }

    // Render cache shapes during resize
    if (canvasService && cachedBoundingBox.value) {
      const scaleX = w / resizeStart.value.w
      const scaleY = h / resizeStart.value.h
      const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
      const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

      // const canvasWidth = canvasStore.width || 800
      // const canvasHeight = canvasStore.height || 600

      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el) {
          let newX, newY
          if (selectedIds.value.length > 1) {
            // Multi-element: scale from center
            const relX = el.x + el.width / 2 - centerX
            const relY = el.y + el.height / 2 - centerY
            newX = centerX + relX * scaleX - el.width * scaleX / 2
            newY = centerY + relY * scaleY - el.height * scaleY / 2
          } else {
            // Single element: scale from corner
            newX = el.x
            newY = el.y
            if (resizeHandle.value.includes('l')) newX += el.width * (1 - scaleX)
            if (resizeHandle.value.includes('t')) newY += el.height * (1 - scaleY)
          }

          if (el.type === 'image') {
            // Update DOM image element - Images use world coordinates
            const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
            if (imgEl) {
              const rotation = el.rotation || 0
              imgEl.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${rotation}rad)`
              imgEl.style.transformOrigin = 'center center'
              imgEl.style.width = `${el.width * scaleX}px`
              imgEl.style.height = `${el.height * scaleY}px`
            }
          } else if (el.type === 'text') {
            // Update DOM text element with rotation preserved (center-based)
            const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
            if (textEl) {
              // const centerX = newX + (el.width * scaleX) / 2
              // const centerY = newY + (el.height * scaleY) / 2
              textEl.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${el.rotation || 0}rad)`
              textEl.style.transformOrigin = 'center center'
              textEl.style.width = `${el.width * scaleX}px`
              textEl.style.height = `${el.height * scaleY}px`
            }
          } else {
            // Update PIXI Graphics - 使用世界坐标
            canvasService.getRenderService().updateElementPosition(id, newX, newY)
            const graphic = canvasService.getRenderService().getGraphic(id)
            if (graphic) {
              graphic.scale.set(scaleX, scaleY)
              // Preserve rotation during resize
              graphic.rotation = el.rotation || 0
            }
          }
        }
      })
    }

    animationFrameId = null
  })
}

const stopResize = () => {
  if (!isResizing.value || !cachedBoundingBox.value) return
  if (animationFrameId) cancelAnimationFrame(animationFrameId)

  const viewport = canvasStore.viewport
  const box = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value

  // 从屏幕尺寸计算回世界尺寸
  const screenWidth = parseFloat(box?.style.width || '0')
  const screenHeight = parseFloat(box?.style.height || '0')
  const worldWidth = screenWidth / viewport.zoom
  const worldHeight = screenHeight / viewport.zoom

  const scaleX = worldWidth / cachedBoundingBox.value.width
  const scaleY = worldHeight / cachedBoundingBox.value.height

  if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
    const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
    const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

    // 展开组合：被选中的 group 以及其 children 一起参与缩放
    const targetIds = new Set<string>()
    selectedIds.value.forEach(id => {
      const el = elementsStore.getElementById(id)
      if (!el) return
      targetIds.add(id)
      if (el.type === 'group' && 'children' in el && Array.isArray(el.children)) {
        el.children.forEach(childId => targetIds.add(childId))
      }
    })

    const allTargetIds = Array.from(targetIds)

    elementsStore.updateElements(allTargetIds, (el) => {
      const isMulti = allTargetIds.length > 1
      const isCircle = el.type === 'shape' && 'shapeType' in el && el.shapeType === 'circle'

      let x = el.x
      let y = el.y
      let newWidth = el.width * scaleX
      let newHeight = el.height * scaleY

      if (isMulti) {
        // 多元素统一绕中心缩放（包括组合自身和其子元素）
        const relX = el.x + el.width / 2 - centerX
        const relY = el.y + el.height / 2 - centerY

        if (isCircle) {
          // 圆形：使用统一缩放比例，保持宽高一致
          const uniformScale = Math.max(scaleX, scaleY)
          const newSize = el.width * uniformScale
          const newCenterX = centerX + relX * uniformScale
          const newCenterY = centerY + relY * uniformScale

          x = newCenterX - newSize / 2
          y = newCenterY - newSize / 2
          newWidth = newSize
          newHeight = newSize
        } else {
          x = centerX + relX * scaleX - (el.width * scaleX) / 2
          y = centerY + relY * scaleY - (el.height * scaleY) / 2
        }
      } else {
        // 单元素缩放（保留原逻辑）
        if (resizeHandle.value.includes('l')) x += el.width * (1 - scaleX)
        if (resizeHandle.value.includes('t')) y += el.height * (1 - scaleY)

        if (isCircle) {
          // 单个圆形缩放时，同样保持宽高一致
          const uniformScale = Math.max(scaleX, scaleY)
          const newSize = el.width * uniformScale
          // 以当前左上角为基准，不改变锚点
          newWidth = newSize
          newHeight = newSize
        }
      }

      el.x = x
      el.y = y
      el.width = newWidth
      el.height = newHeight
    })
    elementsStore.saveToLocal()
    cachedBoundingBox.value = calculateBoundingBox()

    // Reset graphics scale after store update and preserve rotation
    requestAnimationFrame(() => {
      if (canvasService) {
        selectedIds.value.forEach(id => {
          const el = elementsStore.getElementById(id)
          const graphic = canvasService.getRenderService().getGraphic(id)
          if (graphic && el) {
            graphic.scale.set(1, 1)
            graphic.rotation = el.rotation || 0
          }
        })
      }
    })
  }

  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

const startRotate = (e: MouseEvent) => {
  if (!cachedBoundingBox.value) return
  isRotating.value = true

  // Calculate center in world coordinates
  const worldCenterX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
  const worldCenterY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

  // Convert world center to screen coordinates
  const viewport = canvasStore.viewport
  const canvasWidth = canvasStore.width || 800
  const canvasHeight = canvasStore.height || 600
  const screenCenter = CoordinateTransform.worldToScreen(
    worldCenterX,
    worldCenterY,
    viewport,
    canvasWidth,
    canvasHeight
  )

  // Calculate initial angle from screen center to mouse position
  const startAngle = Math.atan2(e.clientY - screenCenter.y, e.clientX - screenCenter.x)
  rotateStart.value = { x: screenCenter.x, y: screenCenter.y, angle: startAngle }
  rotationAngle.value = 0

  // Add dragging class for performance optimization
  const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
  if (boxRef) {
    boxRef.classList.add('dragging')
  }

  document.addEventListener('mousemove', onRotate)
  document.addEventListener('mouseup', stopRotate)
  e.preventDefault()
  e.stopPropagation()
}

const onRotate = (e: MouseEvent) => {
  if (!isRotating.value || !cachedBoundingBox.value) return

  // Calculate current angle from screen center to mouse position
  const currentAngle = Math.atan2(e.clientY - rotateStart.value.y, e.clientX - rotateStart.value.x)
  rotationAngle.value = currentAngle - rotateStart.value.angle

  // Use RAF throttling for performance
  if (animationFrameId) return
  animationFrameId = requestAnimationFrame(() => {
    if (!cachedBoundingBox.value) return

    // Update selection box immediately
    const box = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
    if (box && boundingBox.value) {
      // Set transform origin to center of the box (in screen coordinates)
      const centerX = boundingBox.value.width / 2
      const centerY = boundingBox.value.height / 2
      box.style.transformOrigin = `${centerX}px ${centerY}px`

      // Get current rotation and apply the delta
      const currentRotation = getSelectionRotation()
      const newRotation = currentRotation + rotationAngle.value

      // Apply transform with rotation (selection box is already positioned in screen coords)
      box.style.transform = `translate3d(${boundingBox.value.x}px, ${boundingBox.value.y}px, 0) rotate(${newRotation}rad)`
    }

    // Update all selected elements immediately
    if (canvasService && cachedBoundingBox.value) {
      // const worldCenterX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
      // const worldCenterY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (!el) return

        const newRotation = (el.rotation || 0) + rotationAngle.value

        if (el.type === 'image') {
          // Update DOM image element with rotation - Images use world coordinates
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            // Images are positioned in world coordinates with transform-origin at center
            imgEl.style.transformOrigin = '50% 50%'
            imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${newRotation}rad)`
            imgEl.style.width = `${el.width}px`
            imgEl.style.height = `${el.height}px`
          }
        } else if (el.type === 'text') {
          // Update DOM text element with rotation - Text uses world coordinates like images
          const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (textEl) {
            // Text elements are positioned in world coordinates with transform-origin at center
            textEl.style.transformOrigin = '50% 50%'
            textEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${newRotation}rad)`
            textEl.style.width = `${el.width}px`
            textEl.style.height = `${el.height}px`
          }
        } else {
          // Update PIXI Graphics (shapes) - they're in world coordinates
          const graphic = canvasService.getRenderService().getGraphic(id)
          if (graphic) {
            // Set pivot to center for rotation
            graphic.pivot.set(el.width / 2, el.height / 2)
            // Position at center in world coordinates
            graphic.x = el.x + el.width / 2
            graphic.y = el.y + el.height / 2
            // Apply rotation
            graphic.rotation = newRotation
          }
        }
      })
    }

    animationFrameId = null
  })
}

const stopRotate = () => {
  if (!isRotating.value) return

  // Cancel pending animation frame
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // Remove dragging class
  const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
  if (boxRef) {
    boxRef.classList.remove('dragging')
  }

  // Apply rotation to store if there was a significant change
  if (Math.abs(rotationAngle.value) > 0.01) {
    elementsStore.updateElements(selectedIds.value, (el) => {
      el.rotation = (el.rotation || 0) + rotationAngle.value
    })
    elementsStore.saveToLocal()

    requestAnimationFrame(() => {
      if (canvasService) {
        selectedIds.value.forEach(id => {
          const el = elementsStore.getElementById(id)
          if (!el) return

          if (el.type === 'image') {
            // Reset DOM image element to final rotation - Images use world coordinates
            const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
            if (imgEl) {
              imgEl.style.transformOrigin = '50% 50%'
              imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation || 0}rad)`
              imgEl.style.width = `${el.width}px`
              imgEl.style.height = `${el.height}px`
            }
          } else if (el.type === 'text') {
            // Reset DOM text element to final rotation - Text uses world coordinates
            const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
            if (textEl) {
              textEl.style.transformOrigin = '50% 50%'
              textEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation || 0}rad)`
              textEl.style.width = `${el.width}px`
              textEl.style.height = `${el.height}px`
            }
          } else {
            // Reset PIXI Graphics to final rotation
            const graphic = canvasService.getRenderService().getGraphic(id)
            if (graphic) {
              graphic.rotation = el.rotation || 0
            }
          }
        })
      }
    })

    // Update cached bounding box after rotation
    cachedBoundingBox.value = calculateBoundingBox()
  }

  isRotating.value = false
  rotationAngle.value = 0
  document.removeEventListener('mousemove', onRotate)
  document.removeEventListener('mouseup', stopRotate)
}

// 组件卸载时清理
onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('mousemove', onRotate)
  document.removeEventListener('mouseup', stopRotate)
})

</script>

<style scoped>
.selection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.selection-box {
  position: absolute;
  pointer-events: auto;
  transform-origin: top left;
  /* GPU 加速 */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* 拖拽时启用性能优化 */
.selection-box.dragging {
  will-change: transform;
}

.selection-box.single {
  border: 2px solid #4672EF;
  cursor: move;
}

.selection-box.multi {
  border: 2px solid #4672EF;
  background: rgba(70, 114, 239, 0.05);
  cursor: move;
}

.selection-box.draggable:hover {
  background: rgba(70, 114, 239, 0.1);
}

.resize-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: white;
  border: 1px solid #4672EF;
  z-index: 101;
}

.resize-handle.top-left {
  top: -5px;
  left: -5px;
  cursor: nwse-resize;
}

.resize-handle.top-right {
  top: -5px;
  right: -5px;
  cursor: nesw-resize;
}

.resize-handle.bottom-left {
  bottom: -5px;
  left: -5px;
  cursor: nesw-resize;
}

.resize-handle.bottom-right {
  bottom: -5px;
  right: -5px;
  cursor: nwse-resize;
}

.rotate-handle {
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid #4672EF;
  border-radius: 50%;
  cursor: grab;
  z-index: 102;
}

.rotate-handle:active {
  cursor: grabbing;
}
</style>
