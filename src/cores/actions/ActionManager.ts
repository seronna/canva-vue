import type { Action, ActionContext } from './types'
import { useElementsStore } from '@/stores/elements'
import { useHistoryStore } from '@/stores/history'
import { useSelectionStore } from '@/stores/selection'
import { useCanvasStore } from '@/stores/canvas'

export class ActionManager {
  private actions: Map<string, Action> = new Map()
  private dynamicContext: Record<string, any> = {}

  /** 注入动态运行环境（供 UI 层在初始化时挂载自身依赖） */
  setDynamicContext(key: string, value: any) {
    this.dynamicContext[key] = value
  }

  /** 注册 Action */
  registerAction(action: Action) {
    if (this.actions.has(action.name)) {
      console.warn(`[ActionManager] Action "${action.name}" is already registered.`)
      return
    }
    this.actions.set(action.name, action)
  }

  /** 注销 Action */
  unregisterAction(name: string) {
    this.actions.delete(name)
  }

  /** 获取动态的依赖上下文 */
  private getContext(): ActionContext {
    return {
      elementsStore: useElementsStore(),
      historyStore: useHistoryStore(),
      selectionStore: useSelectionStore(),
      canvasStore: useCanvasStore(),
      dynamicContext: this.dynamicContext
    }
  }

  /**
   * 按名称手动执行 Action
   * 通常由 UI 按钮触发
   */
  executeAction<T = any>(name: string, payload?: T) {
    const action = this.actions.get(name)
    if (!action) {
      console.error(`[ActionManager] Cannot execute unknown action: ${name}`)
      return
    }

    try {
      action.perform(payload, this.getContext())
    } catch (err) {
      console.error(`[ActionManager] Error executing action "${name}":`, err)
    }
  }

  /**
   * 处理键盘事件，自动适配 registered action
   * 返回 true 表示事件被处理并拦截
   */
  handleKeyboardEvent(event: KeyboardEvent): boolean {
    // 遍历所有已注册的 Action，检查 keyTest 是否匹配
    for (const [name, action] of this.actions.entries()) {
      if (action.keyTest && action.keyTest(event)) {
        // 匹配成功，拦截系统默认行为并执行
        event.preventDefault()
        event.stopPropagation()
        this.executeAction(name)
        return true
      }
    }
    return false
  }
}

// 导出全局单例
export const actionManager = new ActionManager()
