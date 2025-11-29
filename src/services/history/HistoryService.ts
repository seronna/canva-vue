/**
 * Service层-历史服务
 * 功能：处理历史记录管理（操作记录、撤销、重做等）
 * 服务对象：为Composables层提供历史操作支持
 */
import type { AnyElement } from '@/cores/types/element'
import { useHistoryStore } from '@/stores/history'

/**
 * Service层-历史服务
 * 功能：处理历史记录管理（操作记录、撤销、重做等）
 * 服务对象：为Composables层提供历史操作支持
 */
export class HistoryService {
  private historyStore = useHistoryStore()

  constructor() {}

  pushSnapshot(snapshot: AnyElement[]) {
    this.historyStore.pushSnapshot(snapshot)
  }

  beginBatch() {
    this.historyStore.beginBatch()
  }

  endBatch() {
    this.historyStore.endBatch()
  }

  /**
   * 执行撤销并返回快照（如果有）
   */
  undo(): AnyElement[] | null {
    return this.historyStore.undo()
  }

  /**
   * 执行重做并返回快照（如果有）
   */
  redo(): AnyElement[] | null {
    return this.historyStore.redo()
  }

  getCurrent(): AnyElement[] | null {
    return this.historyStore.getCurrent()
  }

  canUndo(): boolean {
    return this.historyStore.index > 0
  }

  canRedo(): boolean {
    return this.historyStore.index < this.historyStore.stack.length - 1
  }

  clear() {
    this.historyStore.clear()
  }

  // Expose reactive store properties for consumers
  get stack(): AnyElement[][] {
    return this.historyStore.stack
  }

  get index(): number {
    return this.historyStore.index
  }
}
