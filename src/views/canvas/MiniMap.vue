<template>
  <div class="mini-map" @mousedown="handleMapClick">
    <svg class="mini-map-content" :viewBox="`0 0 ${mapWidth} ${mapHeight}`">
      <!-- 背景 -->
      <rect :width="mapWidth" :height="mapHeight" fill="#f8f9fa" />
      
      <!-- 网格 -->
      <defs>
        <pattern id="minimap-grid" :width="gridSize" :height="gridSize" patternUnits="userSpaceOnUse">
          <path :d="`M ${gridSize} 0 L 0 0 0 ${gridSize}`" fill="none" stroke="#e0e0e0" stroke-width="0.5" />
        </pattern>
      </defs>
      <rect :width="mapWidth" :height="mapHeight" fill="url(#minimap-grid)" />
      
      <!-- 渲染所有元素的缩略图 -->
      <g v-for="element in visibleElements" :key="element.id">
        <!-- 矩形元素 -->
        <rect
          v-if="element.type === 'shape' && element.shapeType === 'rectangle'"
          :x="element.x"
          :y="element.y"
          :width="element.width"
          :height="element.height"
          :fill="element.fillColor || '#4A90E2'"
          :stroke="element.strokeColor || '#000'"
          :stroke-width="0.5"
          opacity="0.7"
        />
        
        <!-- 圆形元素 -->
        <circle
          v-else-if="element.type === 'shape' && element.shapeType === 'circle'"
          :cx="element.x + element.width / 2"
          :cy="element.y + element.height / 2"
          :r="Math.min(element.width, element.height) / 2"
          :fill="element.fillColor || '#E94B3C'"
          :stroke="element.strokeColor || '#000'"
          :stroke-width="0.5"
          opacity="0.7"
        />
        
        <!-- 三角形元素 -->
        <polygon
          v-else-if="element.type === 'shape' && element.shapeType === 'triangle'"
          :points="getTrianglePoints(element)"
          :fill="element.fillColor || '#34C759'"
          :stroke="element.strokeColor || '#000'"
          :stroke-width="0.5"
          opacity="0.7"
        />
        
        <!-- 图片元素 -->
        <rect
          v-else-if="element.type === 'image'"
          :x="element.x"
          :y="element.y"
          :width="element.width"
          :height="element.height"
          fill="#ddd"
          stroke="#999"
          :stroke-width="0.5"
          opacity="0.7"
        />
        
        <!-- 文本元素 -->
        <rect
          v-else-if="element.type === 'text'"
          :x="element.x"
          :y="element.y"
          :width="element.width"
          :height="element.height"
          fill="#fff"
          stroke="#666"
          :stroke-width="0.5"
          opacity="0.7"
        />
      </g>
      
      <!-- 视口指示器 -->
      <rect
        :x="viewportRect.x"
        :y="viewportRect.y"
        :width="viewportRect.width"
        :height="viewportRect.height"
        fill="rgba(66, 133, 244, 0.1)"
        stroke="#4285f4"
        stroke-width="2"
        rx="2"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useElementsStore } from '@/stores/elements'
import type { CanvasService } from '@/services/canvas/CanvasService'
import type { AnyElement, ShapeElement } from '@/cores/types/element'

const canvasStore = useCanvasStore()
const elementsStore = useElementsStore()
const canvasService = inject<CanvasService>('canvasService')

// 小地图尺寸
const mapWidth = 200
const mapHeight = 150

// 网格大小
const gridSize = 20

// 获取所有元素
const elements = computed(() => elementsStore.elements)

// 计算元素的边界范围
const contentBounds = computed(() => {
  if (elements.value.length === 0) {
    return { minX: -500, minY: -500, maxX: 500, maxY: 500 }
  }
  
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  
  elements.value.forEach(el => {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  })
  
  // 添加一些边距
  const padding = 100
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding
  }
})

// 计算世界坐标范围
const worldWidth = computed(() => contentBounds.value.maxX - contentBounds.value.minX)
const worldHeight = computed(() => contentBounds.value.maxY - contentBounds.value.minY)

// 计算缩放比例（保持宽高比）
const scale = computed(() => {
  const scaleX = mapWidth / worldWidth.value
  const scaleY = mapHeight / worldHeight.value
  return Math.min(scaleX, scaleY)
})

// 计算视口在小地图中的位置
const viewportRect = computed(() => {
  
  if (!canvasService) {
    return { x: 0, y: 0, width: mapWidth, height: mapHeight }
  }
  
  const viewportService = canvasService.getViewportService()
  const visibleBounds = viewportService.getVisibleBounds()
  
  // 转换到小地图坐标系
  const x = (visibleBounds.left - contentBounds.value.minX) * scale.value
  const y = (visibleBounds.top - contentBounds.value.minY) * scale.value
  const width = visibleBounds.width * scale.value
  const height = visibleBounds.height * scale.value
  
  return { x, y, width, height }
})

// 过滤可见元素（转换坐标后在地图范围内的）
const visibleElements = computed(() => {
  return elements.value.map(el => {
    const mapX = (el.x - contentBounds.value.minX) * scale.value
    const mapY = (el.y - contentBounds.value.minY) * scale.value
    const mapWidth = el.width * scale.value
    const mapHeight = el.height * scale.value
    
    return {
      ...el,
      x: mapX,
      y: mapY,
      width: mapWidth,
      height: mapHeight
    }
  })
})

// 获取三角形的点坐标
const getTrianglePoints = (element: AnyElement) => {
  const el = element as ShapeElement
  const x = el.x
  const y = el.y
  const w = el.width
  const h = el.height
  
  return `${x + w/2},${y} ${x + w},${y + h} ${x},${y + h}`
}

// 点击小地图跳转到对应位置
const handleMapClick = (event: MouseEvent) => {
  if (!canvasService) return
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const mapClickX = event.clientX - rect.left
  const mapClickY = event.clientY - rect.top
  
  // 小地图坐标转换为世界坐标
  const worldX = mapClickX / scale.value + contentBounds.value.minX
  const worldY = mapClickY / scale.value + contentBounds.value.minY
  
  // 移动相机到点击位置
  const viewportService = canvasService.getViewportService()
  viewportService.setPosition(worldX, worldY)
  canvasService.getRenderService().updateViewportTransform()
  
  // 同步到 store
  canvasStore.updateViewport(viewportService.getViewport())
}
</script>

<style scoped>
.mini-map {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 200px;
  height: 150px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.mini-map:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.mini-map-content {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
