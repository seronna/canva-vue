import { defineStore } from 'pinia'
import type { ViewportState } from '@/cores/types/canvas'

export type ToolType = 'select' | 'pan' | 'rectangle' | 'circle' | 'triangle' | 'text'

export const useCanvasStore = defineStore('canvas', {
  state: () => ({
    width: 0,
    height: 0,
    currentTool: 'select' as ToolType,
    // 视口状态（无限画布）
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    } as ViewportState,
    // 工具预览临时状态（世界坐标相关信息）
    toolPreview: {
      active: false,
      tool: 'select' as ToolType, // 当前想要预览的工具
      x: 0,
      y: 0
    }
  }),

  actions: {
    setTool(tool: ToolType) {
      this.currentTool = tool
    },

    updateViewport(partial: Partial<ViewportState>) {
      this.viewport = { ...this.viewport, ...partial }
    },

    updateToolPreview(active: boolean, tool?: ToolType, x = 0, y = 0) {
      this.toolPreview.active = active
      if (active) {
        if (tool) this.toolPreview.tool = tool
        this.toolPreview.x = x
        this.toolPreview.y = y
      }
    }
  }
})
