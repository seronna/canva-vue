<!--
  选中框组件 - 支持拖拽移动
-->
<template>
  <div class="selection-overlay">
    <!-- 单选边框 -->
    <div
      v-if="selectedIds.length >= 1 && boundingBox"
      class="selection-box single"
      :style="{
        left: boundingBox.x + 'px',
        top: boundingBox.y + 'px',
        width: boundingBox.width + 'px',
        height: boundingBox.height + 'px'
      }"
      @mousedown="startDrag"
    >
      <!-- 四个角的控制点 -->
      <div
        class="resize-handle top-left"
        @mousedown="(e) => startResize(e, 'top-left')"
      ></div>
      <div
        class="resize-handle top-right"
        @mousedown="(e) => startResize(e, 'top-right')"
      ></div>
      <div
        class="resize-handle bottom-left"
        @mousedown="(e) => startResize(e, 'bottom-left')"
      ></div>
      <div
        class="resize-handle bottom-right"
        @mousedown="(e) => startResize(e, 'bottom-right')"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import { useElementsStore } from '@/stores/elements'
import { SelectionService } from '@/services/selection/SelectionService'

const selectionStore = useSelectionStore()
const elementsStore = useElementsStore()
const selectionService = new SelectionService()

const selectedIds = computed(() => selectionStore.selectedIds)
const isDragging = ref(false)
const isResizing = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const resizeHandleType = ref<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left')
const startElementData = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const startBoundingBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)

// 开始拖拽移动
const startDrag = (event: MouseEvent) => {
  if (selectedIds.value.length === 0) return

  isDragging.value = true
  dragStartPos.value = { x: event.clientX, y: event.clientY }

  // 添加全局事件监听
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', stopDragMove)

  // 阻止默认行为和事件冒泡
  event.preventDefault()
  event.stopPropagation()

  console.log('开始拖拽选中框')
}

// 拖拽移动中
const onDragMove = (event: MouseEvent) => {
  if (!isDragging.value) return

  // 计算移动距离
  const dx = event.clientX - dragStartPos.value.x
  const dy = event.clientY - dragStartPos.value.y

  // 更新起始位置
  dragStartPos.value = { x: event.clientX, y: event.clientY }

  // 移动所有选中的元素
  if (selectedIds.value.length > 0) {
    elementsStore.moveElements(selectedIds.value, dx, dy)
  }
}

// 停止拖拽移动
const stopDragMove = () => {
  if (!isDragging.value) return

  isDragging.value = false

  // 移除全局事件监听
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDragMove)

  console.log('拖拽移动完成')
}

// 开始缩放
const startResize = (event: MouseEvent, handleType: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
  if (selectedIds.value.length === 0) return

  isResizing.value = true
  resizeHandleType.value = handleType
  dragStartPos.value = { x: event.clientX, y: event.clientY }

  // 保存初始数据
  if (selectedIds.value.length === 1) {
    // 单个元素
    const elementId = selectionStore.firstSelectedId
    if (elementId) {
      const element = elementsStore.getElementById(elementId)
    if (element) {
      startElementData.value = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height
      }
    }
    }
  } else {
    // 多个元素
    startBoundingBox.value = selectionService.calculateBoundingBox(selectedIds.value)
  }

  // 添加全局事件监听
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)

  // 阻止默认行为和事件冒泡
  event.preventDefault()
  event.stopPropagation()

  console.log('开始缩放，控制点:', handleType)
}

// 缩放中
const onResize = (event: MouseEvent) => {
  if (!isResizing.value) return

  // 计算移动距离
  const dx = event.clientX - dragStartPos.value.x
  const dy = event.clientY - dragStartPos.value.y

  if (selectedIds.value.length === 1 && startElementData.value) {
    // 单个元素缩放
    const elementId = selectedIds.value[0]
    const { x, y, width, height } = startElementData.value
    if(elementId){
      selectionService.resizeElement(elementId, resizeHandleType.value, dx, dy, x, y, width, height)
    }
  } else if (selectedIds.value.length > 1 && startBoundingBox.value) {
    // 多个元素缩放
    selectionService.resizeElements(selectedIds.value, resizeHandleType.value, dx, dy, startBoundingBox.value)
  }
}

// 停止缩放
const stopResize = () => {
  if (!isResizing.value) return

  isResizing.value = false
  startElementData.value = null
  startBoundingBox.value = null

  // 移除全局事件监听
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)

  console.log('缩放完成')
}

// 计算选中元素的组合边界框
const boundingBox = computed(() => {
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
  pointer-events: auto; /* 允许交互 */
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
</style>
