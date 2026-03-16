<!--
View层 - 画布容器组件
职责：提供 PIXI 渲染引擎的挂载点和图片元素渲染
-->
<template>
  <div>
    <top-toolbar />
    <floating-toolbar />
    <image-toolbar />
    <selection-overlay />
    <interactive-overlay />
    <!-- <mini-map /> -->

    <!-- 文本编辑工具栏 -->
    <text-editor-toolbar
      v-if="editingTextElement && textEditor && isTextEditing"
      :editor="textEditor"
      :is-editing="true"
      :element-x="editingTextElement.x"
      :element-y="editingTextElement.y"
      :element-width="editingTextElement.width"
    />

    <div ref="container" class="pixi-canvas">
      <!-- 背景网格 -->
      <!-- <grid-background /> -->

      <!-- 世界容器 - 跟随画布变换 -->
      <div class="world-container" :style="worldContainerStyle" :class="{ panning: isPanning }">
        <!-- 对齐辅助线 -->
        <!-- <guidelines-overlay class="no-pointer-events" /> -->

        <!-- 渲染图片元素 -->
        <image-element v-for="imageEl in imageElements" :key="imageEl.id" :element="imageEl" />
      </div>

      <!-- 文本元素独立容器 - 移到外面确保能接收事件 -->
      <div class="text-container" :style="worldContainerStyle" :class="{ panning: isPanning }">
        <text-element
          v-for="textEl in textElements"
          :key="textEl.id"
          :element="textEl"
          @dblclick="handleTextDoubleClick"
        />

        <!-- 文本编辑器 - 使用世界坐标，放在 text-container 内跟随变换 -->
        <text-editor
          ref="textEditorRef"
          v-if="editingTextId"
          :element-id="editingTextId"
          @close="editingTextId = null"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import TopToolbar from '../../views/ui/TopToolbar.vue'
import FloatingToolbar from '../../views/ui/FloatingToolbar.vue'
import ImageToolbar from '../../views/ui/toolbar/ImageToolbar.vue'
import SelectionOverlay from '../../views/overlays/SelectionOverlay.vue'
import InteractiveOverlay from '../../views/overlays/InteractiveOverlay.vue'
import GridBackground from '../../views/canvas/GridBackground.vue'
import MiniMap from '../../views/canvas/MiniMap.vue'
import GuidelinesOverlay from '../overlays/GuidelinesOverlay.vue'
import ImageElement from '../../views/elements/ImageElement.vue'
import TextElement from '../../views/elements/TextElement.vue'
import TextEditor from '../../views/overlays/TextEditor.vue'
import TextEditorToolbar from '../../views/ui/TextEditorToolbar.vue'
import { useCanvas } from '@/composables/useCanvas'
import { useElementsStore } from '@/stores/elements'
import { useCanvasStore } from '@/stores/canvas'
import { useActionManager } from '@/composables/useActionManager'
import { actionManager } from '@/cores/actions/ActionManager'
import type { ImageElement as ImageElementType, TextElement as TextElementType } from '@/cores/types/element'

const { container, canvasService } = useCanvas()
const elementsStore = useElementsStore()
const canvasStore = useCanvasStore()
const { viewport } = storeToRefs(canvasStore)

// 鼠标位置跟踪
const mousePosition = ref({ x: 0, y: 0 })

// 鼠标移动事件处理
const handleMouseMove = (event: MouseEvent) => {
  if (!container.value) return;
  const rect = container.value.getBoundingClientRect();
  mousePosition.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

// 平移状态（根据当前工具判断）
const isPanning = computed(() => canvasStore.currentTool === "pan")

// 提供 canvasService 给子组件使用
provide("canvasService", canvasService)

// 当前编辑的文本元素ID
const editingTextId = ref<string | null>(null)

// 提供编辑状态给子组件
provide("editingTextId", editingTextId)

// TextEditor 组件引用
const textEditorRef = ref<InstanceType<typeof TextEditor> | null>(null)

// 获取当前编辑的文本元素
const editingTextElement = computed(() => {
  if (!editingTextId.value) return null
  const el = elementsStore.getElementById(editingTextId.value)
  return el?.type === 'text' ? (el as TextElementType) : null
})

// 获取编辑器实例（从 TextEditor 组件暴露的）
const textEditor = computed(() => {
  return textEditorRef.value?.editor || null
})

// 是否正在编辑
const isTextEditing = computed(() => {
  return textEditorRef.value?.isEditing || false
})

// 获取所有图片元素
const imageElements = computed(() => {
  return elementsStore.elements.filter(el => el.type === 'image') as ImageElementType[]
})

// 获取所有文本元素（编辑中的文本元素不显示）
const textElements = computed(() => {
  return elementsStore.elements.filter(el =>
    el.type === 'text' && el.id !== editingTextId.value
  ) as TextElementType[]
})

// 世界容器样式 - 跟随画布变换（与 PIXI worldContainer 保持一致）
const worldContainerStyle = computed(() => {
  const v = viewport.value
  const canvasWidth = window.innerWidth
  const canvasHeight = window.innerHeight

  // 与 RenderService.updateViewportTransform 保持一致的变换逻辑
  const translateX = canvasWidth / 2 - v.x * v.zoom
  const translateY = canvasHeight / 2 - v.y * v.zoom

  return {
    position: 'absolute' as const,
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    transformOrigin: '0 0',
    transform: `translate(${translateX}px, ${translateY}px) scale(${v.zoom})`
  }
})

// 处理文本双击
const handleTextDoubleClick = (elementId: string) => {
  editingTextId.value = elementId
}

// 初始化 Action 系统，替代原本的 globalKeyboard
useActionManager()

// 初始化时将长期不可变依赖注入动态环境
actionManager.setDynamicContext('canvasService', canvasService)
actionManager.setDynamicContext('editingTextId', editingTextId)

// 同步关键状态到 ActionManager 动态环境，以便跨界调用
watchEffect(() => {
  actionManager.setDynamicContext('mousePosition', mousePosition.value)
})

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('keyup', handleKeyUp)

  // 注册局部上下文 Action：按 Esc 取消文字编辑
  actionManager.registerAction({
    name: 'cancel-text-edit',
    desc: '退出文本编辑',
    perform: (_, { dynamicContext }) => {
      const editId = dynamicContext.editingTextId
      if (editId && editId.value) {
        editId.value = null
      }
    },
    keyTest: (e) => e.key === 'Escape'
  })

  // 临时空格平移模式
  let spacePressed = false
  actionManager.registerAction({
    name: 'toggle-pan',
    desc: '临时平移模式',
    perform: (_, { dynamicContext }) => {
      const service = dynamicContext.canvasService
      if (!spacePressed && service) {
        spacePressed = true
        if (service.getCurrentTool() !== 'pan') {
          service.setCanvasCursor('grab')
        }
      }
    },
    keyTest: (e) => e.code === 'Space' && !e.repeat
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('keyup', handleKeyUp)
  // 移除空格释放监听
  actionManager.unregisterAction('cancel-text-edit')
  actionManager.unregisterAction('toggle-pan')
})

// 单独全局监听空格释放（因为 ActionManager 只监听 keydown）
const handleKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    const service = actionManager['dynamicContext']?.canvasService
    if (service) {
      service.setCanvasCursor(service.getCurrentTool() === 'pan' ? 'grab' : 'default')
      // 重置状态可通过重新执行某种事件处理，这里简单处理
    }
  }
}
</script>

<style scoped>
.pixi-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #f5f5f5;
  overflow: hidden;
}

.world-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}

.world-container > *:not(.no-pointer-events) {
  pointer-events: auto;
}

/* 平移时禁用所有元素交互 */
.world-container.panning > * {
  pointer-events: none !important;
}

.text-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100; /* 比 world-container 更高 */
  pointer-events: none; /* 容器不接收事件 */
}

.text-container > * {
  pointer-events: auto; /* 文本元素接收事件 */
}

/* 平移时禁用所有文本元素交互 */
.text-container.panning > * {
  pointer-events: none !important;
}
</style>
