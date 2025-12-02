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
import { useDragSync } from '@/composables/useDragSync'
import { useDragState } from '@/composables/useDragState'
import type { CanvasService } from '@/services/canvas/CanvasService'

const selectionStore = useSelectionStore()
const elementsStore = useElementsStore()

// 注入 canvasService
const canvasService = inject<CanvasService>('canvasService')
const { syncDragPosition } = canvasService ? useDragSync(canvasService) : { syncDragPosition: () => {} }
const { getDragState, startDrag: startGlobalDrag, updateDragOffset: updateGlobalDragOffset, endDrag: endGlobalDrag } = useDragState()

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

  const selectedElements = selectedIds.value
    .map(id => elementsStore.getElementById(id))
    .filter(el => el != null)

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
    return el ? `${el.x},${el.y},${el.width},${el.height}` : ''
  }).join('|'),
  () => {
    cachedBoundingBox.value = calculateBoundingBox()
  },
  { immediate: true }
)

// 实际显示的边界框（拖拽时应用全局偏移）
const boundingBox = computed(() => {
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

  // 计算累计偏移量
  const dx = event.clientX - dragStartPos.value.x
  const dy = event.clientY - dragStartPos.value.y

  totalOffset.value = { x: dx, y: dy }

  // 立即更新全局拖拽偏移
  updateGlobalDragOffset({ x: dx, y: dy })

  // 使用 RAF 节流
  if (animationFrameId !== null) {
    return // 已有待处理的帧，跳过
  }

  animationFrameId = requestAnimationFrame(() => {
    // 直接更新选中框 DOM，使用 translate3d 启用 GPU 加速
    const boxRef = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
    if (boxRef && cachedBoundingBox.value) {
      const newX = cachedBoundingBox.value.x + totalOffset.value.x
      const newY = cachedBoundingBox.value.y + totalOffset.value.y
      boxRef.style.transform = `translate3d(${newX}px, ${newY}px, 0)`
    }

    // 同步更新元素位置
    if (selectedIds.value.length > 0) {
      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el?.type === 'image') {
          // Update DOM image element
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            imgEl.style.transform = `translate3d(${el.x + totalOffset.value.x}px, ${el.y + totalOffset.value.y}px, 0)`
          }
        }
      })
      // Update PIXI Graphics
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
    elementsStore.moveElements(selectedIds.value, totalOffset.value.x, totalOffset.value.y)
    elementsStore.saveToLocal()

    // Reset DOM image transforms after store update
    requestAnimationFrame(() => {
      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el?.type === 'image') {
          const imgEl = document.querySelector(`img[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0)`
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
  const dx = e.clientX - resizeStart.value.x
  const dy = e.clientY - resizeStart.value.y
  let w = resizeStart.value.w
  let h = resizeStart.value.h

  if (resizeHandle.value.includes('r')) w += dx
  if (resizeHandle.value.includes('l')) w -= dx
  if (resizeHandle.value.includes('b')) h += dy
  if (resizeHandle.value.includes('t')) h -= dy

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
      let x, y
      if (selectedIds.value.length > 1) {
        // Multi-element: center the selection box
        const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
        const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2
        x = centerX - w / 2
        y = centerY - h / 2
      } else {
        // Single element: anchor from corner
        x = cachedBoundingBox.value.x
        y = cachedBoundingBox.value.y
        if (resizeHandle.value.includes('l')) x += cachedBoundingBox.value.width - w
        if (resizeHandle.value.includes('t')) y += cachedBoundingBox.value.height - h
      }
      box.style.transform = `translate3d(${x}px, ${y}px, 0)`
      box.style.width = w + 'px'
      box.style.height = h + 'px'
    }

    // Render cache shapes during resize
    if (canvasService && cachedBoundingBox.value) {
      const scaleX = w / resizeStart.value.w
      const scaleY = h / resizeStart.value.h
      const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
      const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

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
            // Update DOM image element
            const imgEl = document.querySelector(`img[data-element-id="${id}"]`) as HTMLElement
            if (imgEl) {
              imgEl.style.transform = `translate3d(${newX}px, ${newY}px, 0)`
              imgEl.style.width = `${el.width * scaleX}px`
              imgEl.style.height = `${el.height * scaleY}px`
            }
          } else {
            // Update PIXI Graphics
            canvasService.getRenderService().updateElementPosition(id, newX, newY)
            const graphic = canvasService.getRenderService().getGraphic(id)
            if (graphic) {
              graphic.scale.set(scaleX, scaleY)
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

  const box = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
  const scaleX = parseFloat(box?.style.width || '0') / cachedBoundingBox.value.width
  const scaleY = parseFloat(box?.style.height || '0') / cachedBoundingBox.value.height

  if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
    const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
    const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2

    elementsStore.updateElements(selectedIds.value, (el) => {
      let x, y
      if (selectedIds.value.length > 1) {
        // Multi-element: scale from center
        const relX = el.x + el.width / 2 - centerX
        const relY = el.y + el.height / 2 - centerY
        x = centerX + relX * scaleX - el.width * scaleX / 2
        y = centerY + relY * scaleY - el.height * scaleY / 2
      } else {
        // Single element: scale from corner
        x = el.x
        y = el.y
        if (resizeHandle.value.includes('l')) x += el.width * (1 - scaleX)
        if (resizeHandle.value.includes('t')) y += el.height * (1 - scaleY)
      }
      el.x = x
      el.y = y
      el.width = el.width * scaleX
      el.height = el.height * scaleY
    })
    elementsStore.saveToLocal()
    cachedBoundingBox.value = calculateBoundingBox()

    // Reset graphics scale after store update
    requestAnimationFrame(() => {
      if (canvasService) {
        selectedIds.value.forEach(id => {
          const graphic = canvasService.getRenderService().getGraphic(id)
          if (graphic) graphic.scale.set(1, 1)
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
  const centerX = cachedBoundingBox.value.x + cachedBoundingBox.value.width / 2
  const centerY = cachedBoundingBox.value.y + cachedBoundingBox.value.height / 2
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
  rotateStart.value = { x: centerX, y: centerY, angle: startAngle }
  rotationAngle.value = 0
  document.addEventListener('mousemove', onRotate)
  document.addEventListener('mouseup', stopRotate)
  e.preventDefault()
  e.stopPropagation()
}

const onRotate = (e: MouseEvent) => {
  if (!isRotating.value || !cachedBoundingBox.value) return
  const currentAngle = Math.atan2(e.clientY - rotateStart.value.y, e.clientX - rotateStart.value.x)
  rotationAngle.value = currentAngle - rotateStart.value.angle

  if (animationFrameId) return
  animationFrameId = requestAnimationFrame(() => {
    const box = selectedIds.value.length === 1 ? singleBoxRef.value : multiBoxRef.value
    if (box && cachedBoundingBox.value) {
      const centerX = cachedBoundingBox.value.width / 2
      const centerY = cachedBoundingBox.value.height / 2
      box.style.transformOrigin = `${centerX}px ${centerY}px`
      box.style.transform = `translate3d(${cachedBoundingBox.value.x}px, ${cachedBoundingBox.value.y}px, 0) rotate(${rotationAngle.value}rad)`
    }

    if (canvasService && cachedBoundingBox.value) {
      selectedIds.value.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el) {
          if (el.type === 'image') {
            const imgEl = document.querySelector(`img[data-element-id="${id}"]`) as HTMLElement
            if (imgEl) {
              // const centerX = el.x + el.width / 2
              // const centerY = el.y + el.height / 2
              imgEl.style.transformOrigin = `${el.width / 2}px ${el.height / 2}px`
              imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${(el.rotation || 0) + rotationAngle.value}rad)`
            }
          } else {
            const graphic = canvasService.getRenderService().getGraphic(id)
            if (graphic) {
              graphic.pivot.set(el.width / 2, el.height / 2)
              graphic.x = el.x + el.width / 2
              graphic.y = el.y + el.height / 2
              graphic.rotation = (el.rotation || 0) + rotationAngle.value
            }
          }
        }
      })
    }
    animationFrameId = null
  })
}

const stopRotate = () => {
  if (!isRotating.value) return
  if (animationFrameId) cancelAnimationFrame(animationFrameId)

  if (Math.abs(rotationAngle.value) > 0.01) {
    elementsStore.updateElements(selectedIds.value, (el) => {
      el.rotation = (el.rotation || 0) + rotationAngle.value
    })
    elementsStore.saveToLocal()

    requestAnimationFrame(() => {
      if (canvasService) {
        selectedIds.value.forEach(id => {
          const graphic = canvasService.getRenderService().getGraphic(id)
          if (graphic) {
            const el = elementsStore.getElementById(id)
            graphic.rotation = el?.rotation || 0
          }
        })
      }
    })
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
