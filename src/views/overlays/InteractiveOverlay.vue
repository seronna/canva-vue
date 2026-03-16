<!--
  InteractiveOverlay.vue
  View层 - 交互覆盖层组件
  职责：纯净地在 DOM / SVG 层中渲染临时交互 UI，如“框选框”以及“画笔工具预览”
  脱离底层的 PIXI，降低临时交互带来的无用重绘。
-->
<template>
  <div class="interactive-overlay">
    <!-- 1. 框选选取框 (Box Selection) -->
    <div
      v-if="boxSelection.active"
      class="selection-box-preview"
      :style="{
        left: px(screenBox.x),
        top: px(screenBox.y),
        width: px(screenBox.width),
        height: px(screenBox.height),
      }"
    ></div>

    <!-- 2. 工具预览 (Tool Preview) -->
    <svg 
      v-if="toolPreview.active && isDrawingTool"
      class="tool-preview-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        :style="{
          transform: `translate(${px(screenPreview.x)}, ${px(screenPreview.y)})`
        }"
      >
        <!-- 矩形预览 -->
        <rect
          v-if="toolPreview.tool === 'rectangle' || toolPreview.tool === 'text'"
          x="-100"
          y="-75"
          width="200"
          height="150"
          fill="rgba(74, 144, 226, 0.5)"
        />
        <!-- 文本工具预览也共享了同等的起始大小 -->

        <!-- 圆形预览 -->
        <circle
          v-else-if="toolPreview.tool === 'circle'"
          cx="0"
          cy="0"
          r="75"
          fill="rgba(233, 75, 60, 0.5)"
        />

        <!-- 三角形预览 -->
        <polygon
          v-else-if="toolPreview.tool === 'triangle'"
          points="0,-75 -75,75 75,75"
          fill="rgba(52, 199, 89, 0.5)"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useCanvasStore } from '@/stores/canvas'
import { CoordinateTransform } from '@/cores/viewport/CoordinateTransform'

const selectionStore = useSelectionStore()
const canvasStore = useCanvasStore()

const { boxSelection } = storeToRefs(selectionStore)
const { toolPreview, viewport, width: canvasWidth, height: canvasHeight } = storeToRefs(canvasStore)

// 帮助函数
const px = (val: number) => `${val}px`

// 解构视图缩放大小
const viewportZoom = computed(() => viewport.value.zoom)

// 将世界坐标下的 BoxSelection 反算回屏幕物理坐标展示
const screenBox = computed(() => {
  if (!boxSelection.value.active) return { x: 0, y: 0, width: 0, height: 0 }
  
  const { x, y, width, height } = boxSelection.value
  
  // 转换原点
  const screenPos = CoordinateTransform.worldToScreen(x, y, viewport.value, canvasWidth.value, canvasHeight.value)
  
  // 尺寸随缩放变化
  return {
    x: screenPos.x,
    y: screenPos.y,
    width: width * viewportZoom.value,
    height: height * viewportZoom.value
  }
})

// 工具预览位置（由于预览的“物理初始大小”在原始 PIXI 逻辑中是反比于 zoom 的。
// 这保证了它在屏幕上看起来总是固定的 150px 左右。因此对于 SVG 我们设定固有尺寸，应用 viewBox 自身的缩放抵消即可。）
const screenPreview = computed(() => {
  if (!toolPreview.value.active) return { x: 0, y: 0 }
  const screenPos = CoordinateTransform.worldToScreen(
    toolPreview.value.x, 
    toolPreview.value.y, 
    viewport.value, 
    canvasWidth.value, 
    canvasHeight.value
  )
  return {
    x: screenPos.x,
    y: screenPos.y
  }
})

// 判断是否是支持预览的画笔工具
const isDrawingTool = computed(() => {
  const t = toolPreview.value.tool
  return t === 'rectangle' || t === 'circle' || t === 'triangle' || t === 'text'
})
</script>

<style scoped>
.interactive-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 关键：事件穿透让底层 EventService 继续收集鼠标指针及拖拽 */
  z-index: 50; /* 放置于 SelectionOverlay 下方，或根据需求微调 */
  overflow: hidden;
}

/* 框选框样式：对齐之前 PIXI 给的 0x4A90E2 色 */
.selection-box-preview {
  position: absolute;
  border: 2px solid #4A90E2;
  background-color: rgba(74, 144, 226, 0.1);
  box-sizing: border-box;
}

.tool-preview-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
