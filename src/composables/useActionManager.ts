import { onMounted, onUnmounted } from 'vue'
import { actionManager } from '@/cores/actions/ActionManager'

// 导入所有注册的 Actions
import * as elementActions from '@/cores/actions/elementActions'
import * as historyActions from '@/cores/actions/historyActions'

export function useActionManager() {
  /**
   * 初始化所有的 Actions 注册
   */
  const initializeActions = () => {
    // 遍历注册所有 element 相关的 Actions
    Object.values(elementActions).forEach((mod) => {
      const action = mod as any
      if (action && action.name && action.perform) {
        actionManager.registerAction(action)
      }
    })

    // 遍历注册所有 history 相关的 Actions
    Object.values(historyActions).forEach((mod) => {
      const action = mod as any
      if (action && action.name && action.perform) {
        actionManager.registerAction(action)
      }
    })
  }

  /**
   * 键盘事件中心化分发处理函数
   */
  const handleKeydown = (e: KeyboardEvent) => {
    // 如果在输入框内，阻止触发画布快捷键
    const target = e.target as HTMLElement
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable

    if (isInput) return

    actionManager.handleKeyboardEvent(e)
  }

  onMounted(() => {
    initializeActions()
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  // 暴露给 Vue template 使用的快捷调用方法
  return {
    executeAction: (name: string, payload?: any) => {
      actionManager.executeAction(name, payload)
    }
  }
}
