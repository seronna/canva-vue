/**
 * Service层-工具服务
 * 功能：管理绘图工具状态和工具预览
 * 职责：
 * 1. 管理当前激活的工具
 * 2. 处理工具预览逻辑
 * 3. 提供工具切换API
 */
import { Graphics, FederatedPointerEvent, Application, Container } from 'pixi.js'
import type { ViewportService } from './ViewportService'

export type ToolType = 'select' | 'pan' | 'rectangle' | 'circle' | 'triangle' | 'text'

interface ToolConfig {
  type: ToolType
  previewSize?: { width: number; height: number }
  fillColor?: string
}

import { useCanvasStore } from '@/stores/canvas'

export class ToolService {
  private currentTool: ToolType = 'select'
  private app: Application | null = null
  private worldContainer: Container | null = null
  private viewportService: ViewportService | null = null
  
  // 用于触发工具预览状态更新
  private canvasStore = useCanvasStore()

  constructor() { }

  /**
   * 设置Application实例和世界容器
   */
  setApp(app: Application, worldContainer?: Container): void {
    this.app = app
    this.worldContainer = worldContainer || null
  }

  /**
   * 设置 ViewportService 实例
   */
  setViewportService(viewportService: ViewportService): void {
    this.viewportService = viewportService
  }

  /**
   * 设置当前工具
   */
  setTool(tool: ToolType): void {
    this.currentTool = tool
    // 切换工具时清除预览
    this.clearPreview()
  }

  /**
   * 获取当前工具
   */
  getTool(): ToolType {
    return this.currentTool
  }

  /**
   * 是否是绘图工具
   */
  isDrawingTool(tool?: ToolType): boolean {
    const t = tool || this.currentTool
    return t === 'rectangle' || t === 'circle' || t === 'triangle' || t === 'text'
  }

  /**
   * 更新工具预览（使用世界坐标）
   */
  updatePreview(event: FederatedPointerEvent, worldX: number, worldY: number): void {
    if (!this.app || !this.worldContainer) return

    if (this.isDrawingTool()) {
      this.canvasStore.updateToolPreview(true, this.currentTool, worldX, worldY)
    } else {
      this.clearPreview()
    }
  }

  /**
   * 清除预览
   */
  clearPreview(): void {
    this.canvasStore.updateToolPreview(false)
  }

  /**
   * 获取工具配置
   */
  getToolConfig(tool?: ToolType): ToolConfig {
    const t = tool || this.currentTool

    const configs: Record<ToolType, ToolConfig> = {
      select: { type: 'select' },
      pan: { type: 'pan' },
      rectangle: {
        type: 'rectangle',
        previewSize: { width: 200, height: 150 },
        fillColor: '#4A90E2'
      },
      circle: {
        type: 'circle',
        previewSize: { width: 150, height: 150 },
        fillColor: '#E94B3C'
      },
      triangle: {
        type: 'triangle',
        previewSize: { width: 150, height: 150 },
        fillColor: '#34C759'
      },
      text: {
        type: 'text',
        previewSize: { width: 200, height: 50 },
        fillColor: '#000000'
      }
    }

    return configs[t]
  }

  /**
   * 计算元素创建位置（考虑鼠标位置和元素大小）
   */
  calculateCreatePosition(
    mouseX: number,
    mouseY: number,
    tool?: ToolType
  ): { x: number; y: number; width: number; height: number } {
    const config = this.getToolConfig(tool)

    // 获取当前缩放级别，计算实际创建大小
    const zoom = this.viewportService?.getViewport().zoom || 1

    if (config.type === 'rectangle') {
      const width = 200 / zoom
      const height = 150 / zoom
      return {
        x: mouseX - width / 2,
        y: mouseY - height / 2,
        width,
        height
      }
    } else if (config.type === 'circle') {
      const size = 150 / zoom
      return {
        x: mouseX - size / 2,
        y: mouseY - size / 2,
        width: size,
        height: size
      }
    } else if (config.type === 'triangle') {
      const size = 150 / zoom
      return {
        x: mouseX - size / 2,
        y: mouseY - size / 2,
        width: size,
        height: size
      }
    } else if (config.type === 'text') {
      const width = 200 / zoom
      const height = 50 / zoom
      return {
        x: mouseX - width / 2,
        y: mouseY - height / 2,
        width,
        height
      }
    }

    return { x: mouseX, y: mouseY, width: 100, height: 100 }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.clearPreview()
    this.app = null
  }
}
