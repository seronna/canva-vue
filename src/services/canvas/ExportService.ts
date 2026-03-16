/**
 * Service层-导出服务
 * 功能：将画布上的所有元素渲染到离屏 Canvas，并导出为不同格式
 * 职责：
 * 1. 计算所有元素的精确边界（Bounding Box）
 * 2. 创建并配置高分辨率离屏 Canvas
 * 3. 独立且高清地渲染 Shape / Text / Image
 * 4. 导出为 Base64 / Blob
 */
import type { AnyElement, ShapeElement, TextElement, ImageElement } from '@/cores/types/element'
import type { ViewportState, Rectangle } from '@/cores/types/canvas'

export class ExportService {
  /**
   * 将画布导出为 PNG 数据 URL
   * @param elements 画布元素
   * @param padding 留白边距
   * @param pixelRatio 导出像素比（默认 2 为视网膜高清）
   * @returns Promise<string> Base64 PNG URL
   */
  async exportToPng(
    elements: AnyElement[],
    padding: number = 20,
    pixelRatio: number = 2
  ): Promise<string> {
    if (elements.length === 0) {
      throw new Error('No elements to export')
    }

    // 1. 计算包含所有元素的边界框 (Bounding Box)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    elements.forEach(el => {
      minX = Math.min(minX, el.x)
      minY = Math.min(minY, el.y)
      maxX = Math.max(maxX, el.x + el.width)
      maxY = Math.max(maxY, el.y + el.height)
    })

    const bounds: Rectangle = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }

    // 2. 创建离屏 Canvas
    const canvas = document.createElement('canvas')
    // 逻辑尺寸（加上 padding）
    const logicalWidth = bounds.width + padding * 2
    const logicalHeight = bounds.height + padding * 2

    // 物理尺寸（高清放大）
    canvas.width = logicalWidth * pixelRatio
    canvas.height = logicalHeight * pixelRatio

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create canvas context')

    // 3. 配置上下文变换
    ctx.scale(pixelRatio, pixelRatio)
    // 移动原点，使第一个元素位于 padding 处
    ctx.translate(-bounds.x + padding, -bounds.y + padding)

    // 可选：绘制白色背景（默认透明可以注释掉这段）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(bounds.x - padding, bounds.y - padding, logicalWidth, logicalHeight)

    // 4. 按 z-index 顺序渲染所有元素
    const sortedElements = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

    for (const el of sortedElements) {
      if (!el.visible) continue
      ctx.save()

      // 设置通用属性
      ctx.globalAlpha = el.opacity ?? 1
      
      // 应用旋转（以元素中心为原点转）
      if (el.rotation) {
        const cx = el.x + el.width / 2
        const cy = el.y + el.height / 2
        ctx.translate(cx, cy)
        ctx.rotate(el.rotation)
        ctx.translate(-cx, -cy)
      }

      try {
        if (el.type === 'shape') {
          this.drawShape(ctx, el as ShapeElement)
        } else if (el.type === 'text') {
          this.drawText(ctx, el as TextElement)
        } else if (el.type === 'image') {
          await this.drawImage(ctx, el as ImageElement)
        }
      } catch (err) {
        console.error(`Failed to render element ${el.id}:`, err)
      }

      ctx.restore()
    }

    // 5. 导出 Base64
    return canvas.toDataURL('image/png', 1.0)
  }

  private drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
    ctx.beginPath()

    if (el.shapeType === 'rectangle') {
      ctx.rect(el.x, el.y, el.width, el.height)
    } else if (el.shapeType === 'circle') {
      const radius = el.width / 2
      ctx.arc(el.x + radius, el.y + radius, radius, 0, Math.PI * 2)
    } else if (el.shapeType === 'triangle') {
      ctx.moveTo(el.x + el.width / 2, el.y)
      ctx.lineTo(el.x, el.y + el.height)
      ctx.lineTo(el.x + el.width, el.y + el.height)
      ctx.closePath()
    }

    if (el.fillColor) {
      ctx.fillStyle = el.fillColor
      ctx.fill()
    }

    if (el.strokeWidth && el.strokeWidth > 0 && el.strokeColor) {
      ctx.save()
      ctx.clip() // 限制描边由于中心对齐而向外扩张，模拟内描边
      ctx.lineWidth = el.strokeWidth * 2 // 因为有一半线宽会被裁剪掉，所以乘以 2
      ctx.strokeStyle = el.strokeColor
      ctx.stroke()
      ctx.restore()
    }
  }

  private drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
    if (!el.content) return

    // 构建由 HTML/CSS 定义的字体字符串
    const fontStyle = el.fontStyle || 'normal'
    const fontWeight = el.fontWeight || 'normal'
    const fontSize = el.fontSize || 16
    const fontFamily = el.fontFamily || 'Arial'
    
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
    ctx.textBaseline = 'top' // 与 DOM 默认对齐方式一致
    ctx.fillStyle = el.color || '#000000'

    // 处理多行文本
    // TODO: 目前画布 DOM TextElement 由于是 div，换行是通过 width 控制词回绕或显式换行符
    // 这里做最简单的根据 \n 拆分绘制。若需完全等价，需写字词折行算法
    const lines = el.content.split('\n')
    const lineHeight = fontSize * 1.5 // 近似 line-height: 1.5

    lines.forEach((line: string, index: number) => {
      ctx.fillText(line, el.x, el.y + index * lineHeight)
    })
  }

  private async drawImage(ctx: CanvasRenderingContext2D, el: ImageElement): Promise<void> {
    if (!el.src) return

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // 尝试绕过某些跨域图片由于污染 Canvas 导致的报错
      img.onload = () => {
        // FIXME: 如果 element 有滤镜，可以在这里应用 ctx.filter = '...'
        if (el.filters && el.filters.length > 0) {
          const filterStr = el.filters.map((f: any) => {
            if (f.type === 'blur') return `blur(${f.value}px)`
            if (f.type === 'brightness') return `brightness(${f.value})`
            if (f.type === 'contrast') return `contrast(${f.value})`
            return ''
          }).filter(Boolean).join(' ')
          ctx.filter = filterStr || 'none'
        }
        
        ctx.drawImage(img, el.x, el.y, el.width, el.height)
        ctx.filter = 'none'
        resolve()
      }
      img.onerror = (e) => reject(new Error('Image failed to load in export'))
      img.src = el.src
    })
  }
}

export const exportService = new ExportService()
