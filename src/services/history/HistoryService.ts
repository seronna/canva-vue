import type { AnyElement } from '@/cores/types/element'
import { useHistoryStore, type HistoryStats } from '@/stores/history'
import { useElementsStore } from '@/stores/elements'

/**
 * Service层-历史服务
 * 功能：处理历史记录管理（操作记录、撤销、重做等）
 * 服务对象：为Composables层提供历史操作支持
 * 性能优化：
 * - 增量保存：只存储变化的元素数据
 * - 自动压缩：超过100条记录时自动压缩，保留快照点
 * - 缓存管理：维护完整快照缓存，避免重复重建
 */
export class HistoryService {
  private get store() {
    return useHistoryStore()
  }

  private get elementsStore() {
    return useElementsStore()
  }

  constructor() {}

  /** 推入快照（调用方应已准备好快照数据） */
  pushSnapshot(snapshot: AnyElement[], desc: string = '历史记录') {
    this.store.pushSnapshot(snapshot, desc)
  }

  /** 开始批处理操作 */
  beginBatch() {
    this.store.beginBatch()
  }

  /** 结束批处理操作 */
  endBatch() {
    this.store.endBatch()
  }

  /** 撤销操作 */
  undo() {
    const result = this.store.undo()
    if (result && result.snapshot) {
      // 使用history中的snapshot更新elementsStore的状态
      this.elementsStore.elements = result.snapshot
    }
    return result
  }

  /** 重做操作 */
  redo() {
    const result = this.store.redo()
    if (result && result.snapshot) {
      // 使用history中的snapshot更新elementsStore的状态
      this.elementsStore.elements = result.snapshot
    }
    return result
  }

  /** 获取当前快照 */
  getCurrent() {
    return this.store.getCurrent()
  }

  /** 清除所有历史记录 */
  clear() {
    this.store.clear()
  }

  /** 检查是否可撤销 */
  canUndo() {
    return this.store.index > 0
  }

  /** 检查是否可重做 */
  canRedo() {
    return this.store.index < this.store.stack.length - 1
  }

  /** 获取历史记录统计信息（调试用） */
  getStats(): HistoryStats {
    return this.store.getStats()
  }

  /** 获取历史栈长度 */
  getStackLength() {
    return this.store.stack.length
  }

  /** 获取当前索引位置 */
  getCurrentIndex() {
    return this.store.index
  }
}

export const historyService = new HistoryService()
