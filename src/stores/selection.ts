import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', {
  state: () => ({
    selectedIds: [] as string[],
    // 临时框选框状态（世界坐标）
    boxSelection: {
      active: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }
  }),

  getters: {
    /** 是否有元素被选中 */
    hasSelection: (state) => state.selectedIds.length > 0,

    /** 是否为多选状态 */
    isMultiSelect: (state) => state.selectedIds.length > 1,

    /** 获取第一个选中的元素 ID */
    firstSelectedId: (state) => state.selectedIds[0] ?? null,
  },

  actions: {
    /** 选中单个元素 */
    selectElement(id: string) {
      this.selectedIds = [id]
    },

    /** 添加元素到选中列表 */
    addToSelection(id: string) {
      if (!this.selectedIds.includes(id)) {
        this.selectedIds.push(id)
      }
    },

    /** 从选中列表中移除元素 */
    removeFromSelection(id: string) {
      this.selectedIds = this.selectedIds.filter((sid) => sid !== id)
    },

    /** 切换元素的选中状态 */
    toggleSelection(id: string) {
      if (this.selectedIds.includes(id)) {
        this.removeFromSelection(id)
      } else {
        this.addToSelection(id)
      }
    },

    /** 清空所有选中 */
    clearSelection() {
      this.selectedIds = []
    },

    /** 检查元素是否被选中 */
    isSelected(id: string) {
      return this.selectedIds.includes(id)
    },

    /** 更新正在进行的框选状态 */
    updateBoxSelection(active: boolean, x = 0, y = 0, width = 0, height = 0) {
      this.boxSelection.active = active
      if (active) {
        this.boxSelection.x = x
        this.boxSelection.y = y
        this.boxSelection.width = width
        this.boxSelection.height = height
      }
    }
  },
})
