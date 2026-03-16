import type { useElementsStore } from '@/stores/elements'
import type { useHistoryStore } from '@/stores/history'
import type { useSelectionStore } from '@/stores/selection'
import type { useCanvasStore } from '@/stores/canvas'

export interface ActionContext {
  elementsStore: ReturnType<typeof useElementsStore>
  historyStore: ReturnType<typeof useHistoryStore>
  selectionStore: ReturnType<typeof useSelectionStore>
  canvasStore: ReturnType<typeof useCanvasStore>
  /** 运行时动态注入的自定义上下文（用于存放随身携带的 UI 层依赖，如 mousePosition、canvasService等） */
  dynamicContext: Record<string, any>
}

export interface Action<TPayload = any> {
  /** Action 唯一标识符 */
  name: string
  /** 操作的语义化描述（部分 Action 触发历史记录需要） */
  desc: string
  /** 
   * 按下快捷键或调用触发时的执行逻辑
   * @param payload 携带的数据载荷
   * @param context 提供的上下文 (Store 等依赖)
   */
  perform: (payload: TPayload, context: ActionContext) => void
  /**
   * 键盘事件匹配规则 (可选)
   * 满足条件则触发该 Action 的 `perform`
   */
  keyTest?: (event: KeyboardEvent) => boolean
  /** 快捷键名称显示用 (可选)，例如 "Ctrl/Cmd + C" */
  keyLabel?: string
}
