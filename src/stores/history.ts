import { defineStore } from 'pinia'
import type { AnyElement } from '@/cores/types/element'

/** 增量差异记录（仅存储变化数据） */
interface DiffRecord {
  changes: Map<string, { before?: Partial<AnyElement>; after?: Partial<AnyElement> }>
  changedIds: string[]
  desc: string
  timestamp: number
}

/** 完整历史快照（用于第一条记录或压缩点） */
interface SnapshotRecord {
  snapshot: AnyElement[]
  changedIds: string[]
  desc: string
  timestamp: number
  isSnapshot: true
}

type HistoryRecord = DiffRecord | SnapshotRecord

export interface HistoryStats {
  totalRecords: number
  diffCount: number
  snapshotCount: number
  estimatedMemoryKB: number
  currentIndex: number
}

interface HistoryState {
  stack: HistoryRecord[]
  index: number
  fullSnapshot: AnyElement[] | null
  maxSize: number
  compressThreshold: number
  batchDepth: number
  pendingRecord: HistoryRecord | null
}

export const useHistoryStore = defineStore('history', {
  state: (): HistoryState => ({
    stack: [],
    index: -1,
    fullSnapshot: null,
    maxSize: 100,
    compressThreshold: 50,
    batchDepth: 0,
    pendingRecord: null,
  }),

  actions: {
    /** 检查是否为快照记录 */
    isSnapshot(record: HistoryRecord): record is SnapshotRecord {
      return 'isSnapshot' in record && record.isSnapshot === true
    },

    /**
     * 生成差异记录（仅存储变化部分）
     * @param before 变化前的完整快照
     * @param after  变化后的完整快照
     * @param desc   操作语义描述（显式传入，不再反射调用栈）
     */
    generateDiffRecord(before: AnyElement[], after: AnyElement[], desc: string): DiffRecord {
      const changes = new Map<string, { before?: Partial<AnyElement>; after?: Partial<AnyElement> }>()
      const changedIds: string[] = []
      const beforeMap = new Map(before.map(e => [e.id, e]))
      const afterMap = new Map(after.map(e => [e.id, e]))

      // 检测修改和删除
      for (const el of before) {
        const afterEl = afterMap.get(el.id)
        if (!afterEl) {
          changedIds.push(el.id)
          changes.set(el.id, { before: el })
        } else if (JSON.stringify(el) !== JSON.stringify(afterEl)) {
          changedIds.push(el.id)
          const diff: { before?: Partial<AnyElement>; after?: Partial<AnyElement> } = {}
          diff.before = this.extractChangedFields(el, afterEl)
          diff.after = this.extractChangedFields(afterEl, el)
          changes.set(el.id, diff)
        }
      }

      // 检测新增
      for (const el of after) {
        if (!beforeMap.has(el.id)) {
          changedIds.push(el.id)
          changes.set(el.id, { after: el })
        }
      }

      return { changes, changedIds, desc, timestamp: Date.now() }
    },

    /** 提取两个对象间的变化字段 */
    extractChangedFields(obj: AnyElement, reference: AnyElement): Partial<AnyElement> {
      const diff: Partial<AnyElement> = { id: obj.id }
      const keys = new Set([...Object.keys(obj), ...Object.keys(reference)])

      for (const key of keys) {
        const objVal = (obj as unknown as Record<string, unknown>)[key]
        const refVal = (reference as unknown as Record<string, unknown>)[key]
        if (key !== 'id' && JSON.stringify(objVal) !== JSON.stringify(refVal)) {
          (diff as unknown as Record<string, unknown>)[key] = objVal
        }
      }

      return diff
    },

    /** 从当前索引重建完整快照 */
    rebuildFullSnapshot(): AnyElement[] {
      if (this.index < 0) return []

      let snapshotIndex = this.index
      let snapshot: AnyElement[] | null = null

      for (let i = this.index; i >= 0; i--) {
        const record = this.stack[i]
        if (record && this.isSnapshot(record)) {
          snapshot = JSON.parse(JSON.stringify(record.snapshot))
          snapshotIndex = i
          break
        }
      }

      if (!snapshot) return []

      for (let i = snapshotIndex + 1; i <= this.index; i++) {
        const record = this.stack[i]
        if (record && !this.isSnapshot(record)) {
          snapshot = this.applyDiffRecord(snapshot, record)
        }
      }

      return snapshot
    },

    /** 应用差异记录到快照 */
    applyDiffRecord(snapshot: AnyElement[], diff: DiffRecord): AnyElement[] {
      const result = JSON.parse(JSON.stringify(snapshot)) as AnyElement[]
      const elementMap = new Map(result.map(e => [e.id, e]))

      for (const [id, change] of diff.changes) {
        if (change.after && !change.before) {
          elementMap.set(id, change.after as AnyElement)
        } else if (change.before && !change.after) {
          elementMap.delete(id)
        } else if (change.before && change.after) {
          const element = elementMap.get(id)
          if (element) Object.assign(element, change.after)
        }
      }

      return Array.from(elementMap.values())
    },

    /**
     * 推入历史记录（增量方式）
     * @param snapshot 深克隆后的完整元素快照
     * @param desc     操作语义描述（显式传入，生产环境 minify 不影响可读性）
     */
    pushSnapshot(snapshot: AnyElement[], desc: string) {
      let record: HistoryRecord

      if (this.index < 0) {
        record = {
          snapshot,
          changedIds: snapshot.map(e => e.id),
          desc,
          timestamp: Date.now(),
          isSnapshot: true,
        }
      } else {
        const before = this.fullSnapshot || this.rebuildFullSnapshot()

        if (JSON.stringify(before) === JSON.stringify(snapshot)) {
          return // 无变化，不记录
        }

        record = this.generateDiffRecord(before, snapshot, desc)
      }

      // 批处理中暂存
      if (this.batchDepth > 0) {
        this.pendingRecord = record
        return
      }

      // 截断未来记录
      if (this.index < this.stack.length - 1) {
        this.stack = this.stack.slice(0, this.index + 1)
      }

      this.stack.push(record)
      this.index++
      this.fullSnapshot = snapshot

      if (this.stack.length > this.compressThreshold) {
        this.compressHistory()
      }
    },

    /** 压缩历史记录：将早期多个 diff 合并为一个快照 */
    compressHistory() {
      if (this.stack.length < this.compressThreshold) return

      const keepCount = Math.ceil(this.maxSize * 0.5)
      const removeCount = this.stack.length - keepCount

      let mergeEndIndex = removeCount
      let baseSnapshot: AnyElement[] | null = null

      for (let i = removeCount - 1; i >= 0; i--) {
        const record = this.stack[i]
        if (record && this.isSnapshot(record)) {
          baseSnapshot = JSON.parse(JSON.stringify(record.snapshot))
          mergeEndIndex = i + 1
          break
        }
      }

      if (!baseSnapshot) {
        const firstRecord = this.stack[0]
        if (firstRecord && this.isSnapshot(firstRecord)) {
          baseSnapshot = JSON.parse(JSON.stringify(firstRecord.snapshot))
          mergeEndIndex = 1
        } else {
          baseSnapshot = []
          mergeEndIndex = 0
        }
      }

      for (let i = mergeEndIndex; i < removeCount; i++) {
        const record = this.stack[i]
        if (record && !this.isSnapshot(record)) {
          if (baseSnapshot === null) baseSnapshot = []
          baseSnapshot = this.applyDiffRecord(baseSnapshot, record)
        }
      }

      const compressedRecord: SnapshotRecord = {
        snapshot: baseSnapshot || [],
        changedIds: (baseSnapshot || []).map(e => e.id),
        desc: 'compressed',
        timestamp: Date.now(),
        isSnapshot: true,
      }

      this.stack = [compressedRecord, ...this.stack.slice(removeCount)]
      this.index -= removeCount - 1
    },

    beginBatch() {
      if (this.batchDepth === 0) this.pendingRecord = null
      this.batchDepth++
    },

    endBatch() {
      if (this.batchDepth <= 0) return
      this.batchDepth--

      if (this.batchDepth === 0 && this.pendingRecord) {
        const record = this.pendingRecord

        if (this.index < this.stack.length - 1) {
          this.stack = this.stack.slice(0, this.index + 1)
        }

        this.stack.push(record)
        this.index++

        if (this.isSnapshot(record)) {
          this.fullSnapshot = record.snapshot
        } else {
          this.fullSnapshot = this.rebuildFullSnapshot()
        }

        this.pendingRecord = null

        if (this.stack.length > this.compressThreshold) {
          this.compressHistory()
        }
      }
    },

    /** 撤销 */
    undo() {
      if (this.index <= 0) return null

      this.index--
      const snapshot = this.rebuildFullSnapshot()
      this.fullSnapshot = snapshot

      const record = this.stack[this.index + 1]
      if (!record) return null

      return {
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        changedIds: record.changedIds,
        desc: record.desc,
      }
    },

    /** 重做 */
    redo() {
      if (this.index >= this.stack.length - 1) return null

      this.index++
      const snapshot = this.rebuildFullSnapshot()
      this.fullSnapshot = snapshot

      const record = this.stack[this.index]
      if (!record) return null

      return {
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        changedIds: record.changedIds,
        desc: record.desc,
      }
    },

    /** 获取当前快照 */
    getCurrent() {
      if (this.index < 0) return null
      if (this.fullSnapshot) return JSON.parse(JSON.stringify(this.fullSnapshot))
      return this.rebuildFullSnapshot()
    },

    /** 清除全部记录 */
    clear() {
      this.stack = []
      this.index = -1
      this.fullSnapshot = null
      this.pendingRecord = null
    },

    /** 获取统计信息（调试用） */
    getStats(): HistoryStats {
      let diffCount = 0
      let snapshotCount = 0
      let totalSize = 0

      for (const record of this.stack) {
        if (this.isSnapshot(record)) {
          snapshotCount++
          totalSize += JSON.stringify(record.snapshot).length
        } else {
          diffCount++
          totalSize += JSON.stringify(Array.from(record.changes.entries())).length
        }
      }

      return {
        totalRecords: this.stack.length,
        diffCount,
        snapshotCount,
        estimatedMemoryKB: Math.round(totalSize / 1024),
        currentIndex: this.index,
      }
    },
  }
})
