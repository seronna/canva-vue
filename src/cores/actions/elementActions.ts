import type { Action } from './types'
import { GroupService } from '@/services'
import { CoordinateTransform } from '@/cores/viewport/CoordinateTransform'

/** 删除选中元素 */
export const actionDeleteSelected: Action = {
  name: 'delete-selected',
  desc: '删除选中的元素',
  keyLabel: 'Backspace / Delete',
  perform: (_, { elementsStore, selectionStore }) => {
    const selectedIds = selectionStore.selectedIds
    if (selectedIds.length === 0) return

    const groupService = new GroupService()
    
    // 1. 删除组合及其子元素
    groupService.deleteGroups(selectedIds)

    // 2. 删除其余非组合元素
    const remainingIds = selectedIds.filter(id => {
      const el = elementsStore.getElementById(id)
      return !el || el.type !== 'group'
    })

    if (remainingIds.length) {
      elementsStore.removeElements(remainingIds)
    }
    
    selectionStore.clearSelection()
  },
  keyTest: (e) => {
    return e.key === 'Backspace' || e.key === 'Delete'
  }
}

/** 复制选中的元素 */
export const actionCopy: Action = {
  name: 'copy',
  desc: '复制选中的元素',
  keyLabel: 'Ctrl/Cmd + C',
  perform: (_, { elementsStore }) => {
    elementsStore.copySelectedElements()
  },
  keyTest: (e) => {
    const isSpecialKey = e.ctrlKey || e.metaKey
    return isSpecialKey && e.key.toLowerCase() === 'c'
  }
}

/** 粘贴元素 */
export const actionPaste: Action = {
  name: 'paste',
  desc: '粘贴复制的内容',
  keyLabel: 'Ctrl/Cmd + V',
  perform: (_, { elementsStore, canvasStore, dynamicContext }) => {
    let pastePosition = undefined
    
    // 如果上下文中注入了鼠标位置，则计算世界坐标进行精准粘贴
    if (dynamicContext.mousePosition) {
      pastePosition = CoordinateTransform.screenToWorld(
        dynamicContext.mousePosition.x,
        dynamicContext.mousePosition.y,
        canvasStore.viewport,
        canvasStore.width || 800,
        canvasStore.height || 600
      )
    }
    
    elementsStore.pasteElements(pastePosition)
  },
  keyTest: (e) => {
    const isSpecialKey = e.ctrlKey || e.metaKey
    return isSpecialKey && e.key.toLowerCase() === 'v'
  }
}
