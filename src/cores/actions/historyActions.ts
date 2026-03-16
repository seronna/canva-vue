import type { Action } from './types'

/** 撤销操作 */
export const actionUndo: Action = {
  name: 'undo',
  desc: '撤销上一步操作',
  keyLabel: 'Ctrl/Cmd + Z',
  perform: (_, { historyStore, elementsStore, selectionStore }) => {
    const result = historyStore.undo()
    if (!result || !result.snapshot) return

    elementsStore.elements = result.snapshot
    elementsStore.saveToLocal()

    const { changedIds } = result
    selectionStore.clearSelection()
    if (changedIds?.length) {
      changedIds.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el && !el.parentGroup) {
          selectionStore.addToSelection(id)
        }
      })
    }
  },
  keyTest: (e) => {
    const isSpecialKey = e.ctrlKey || e.metaKey
    return isSpecialKey && e.key.toLowerCase() === 'z' && !e.shiftKey
  }
}

/** 重做操作 */
export const actionRedo: Action = {
  name: 'redo',
  desc: '重做上一步撤销的操作',
  keyLabel: 'Ctrl/Cmd + Y',
  perform: (_, { historyStore, elementsStore, selectionStore }) => {
    const result = historyStore.redo()
    if (!result || !result.snapshot) return

    elementsStore.elements = result.snapshot
    elementsStore.saveToLocal()

    const { changedIds } = result
    selectionStore.clearSelection()
    if (changedIds?.length) {
      changedIds.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (el && !el.parentGroup) {
          selectionStore.addToSelection(id)
        }
      })
    }
  },
  keyTest: (e) => {
    const isSpecialKey = e.ctrlKey || e.metaKey
    return (isSpecialKey && e.key.toLowerCase() === 'y') ||
           (isSpecialKey && e.shiftKey && e.key.toLowerCase() === 'z')
  }
}
