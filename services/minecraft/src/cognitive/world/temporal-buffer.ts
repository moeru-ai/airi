import type { StateChange } from './types'

/**
 * Rolling window buffer of state changes per entity
 */
export class TemporalBuffer {
  private buffer: Map<string, StateChange[]> = new Map()
  private maxAge: number

  constructor(maxAgeMs: number = 5000) {
    this.maxAge = maxAgeMs
  }

  /**
   * Record a state change
   */
  record(change: StateChange): void {
    const list = this.buffer.get(change.entityId) ?? []
    list.push(change)
    this.buffer.set(change.entityId, list)
  }

  /**
   * Record multiple state changes
   */
  recordAll(changes: StateChange[]): void {
    for (const change of changes) {
      this.record(change)
    }
  }

  /**
   * Query changes for an entity since a given timestamp
   */
  query(entityId: string, since: number): StateChange[] {
    const list = this.buffer.get(entityId) ?? []
    return list.filter(c => c.timestamp >= since)
  }

  /**
   * Query changes for an entity by field
   */
  queryField(entityId: string, field: string, since: number): StateChange[] {
    return this.query(entityId, since).filter(c => c.field === field)
  }

  /**
   * Get all changes for an entity (within max age)
   */
  getAll(entityId: string): StateChange[] {
    const cutoff = Date.now() - this.maxAge
    return this.query(entityId, cutoff)
  }

  /**
   * Prune old entries from all buffers
   */
  prune(): void {
    const cutoff = Date.now() - this.maxAge

    for (const [entityId, list] of this.buffer.entries()) {
      const filtered = list.filter(c => c.timestamp >= cutoff)
      if (filtered.length === 0) {
        this.buffer.delete(entityId)
      }
      else {
        this.buffer.set(entityId, filtered)
      }
    }
  }

  /**
   * Clear all history for an entity
   */
  clearEntity(entityId: string): void {
    this.buffer.delete(entityId)
  }

  /**
   * Clear all buffers
   */
  clear(): void {
    this.buffer.clear()
  }
}
