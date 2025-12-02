<template>
  <div
    class="image-element"
    :style="containerStyle"
    :data-element-id="element.id"
    @mousedown="handleMouseDown"
  >
    <img
      :src="element.src"
      :style="imageStyle"
      :data-element-id="element.id"
      draggable="false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ImageElement } from '@/cores/types/element'
import { useElementDrag } from '@/composables/useElementDrag'

const props = defineProps<{
  element: ImageElement
}>()

// 使用拖拽 composable
const { handleMouseDown } = useElementDrag(props.element.id)

// 容器样式 - 使用 transform3d 启用 GPU 加速
const containerStyle = computed(() => {
  // 调整位置以适应中心变换原点
  const centerX = props.element.x + props.element.width / 2
  const centerY = props.element.y + props.element.height / 2
  
  return {
    position: 'absolute' as const,
    left: '0',
    top: '0',
    width: `${props.element.width}px`,
    height: `${props.element.height}px`,
    transform: `translate3d(${centerX}px, ${centerY}px, 0) rotate(${props.element.rotation || 0}rad)`,
    opacity: props.element.opacity,
    visibility: (props.element.visible ? 'visible' : 'hidden') as 'visible' | 'hidden',
    pointerEvents: (props.element.locked ? 'none' : 'auto') as 'none' | 'auto',
    zIndex: props.element.zIndex,
    cursor: 'move' as const
  }
})

// 图片样式(包含滤镜)
const imageStyle = computed(() => {
  const filters = props.element.filters.map(f => {
    switch (f.type) {
      case 'blur':
        return `blur(${f.value}px)`
      case 'brightness':
        return `brightness(${f.value})`
      case 'contrast':
        return `contrast(${f.value})`
      default:
        return ''
    }
  }).filter(Boolean).join(' ')

  return {
    width: '100%',
    height: '100%',
    objectFit: 'fill' as const,
    filter: filters || 'none',
    userSelect: 'none' as const
  }
})
</script>

<style scoped>
.image-element {
  transform-origin: center center;
  /* 拖拽时启用 GPU 加速 */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.image-element.dragging {
  will-change: transform;
}

.image-element img {
  display: block;
  pointer-events: none;
  /* 优化图片渲染 */
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
</style>
