// src/utils/message-buffer.ts
// ─────────────────────────────────────────────────────────────
// 功能：泛型环形缓冲区，用于 SessionStage 维护 per-session 消息历史。
// 设计依据：
//   - 固定容量 + 覆写最旧元素：内存占用恒定，无需手动 GC。
//   - JS 数组 shift() 是 O(n)，环形缓冲区可在 push 场景保持 O(1)。
//   - getRecent(n) 供 ProcessStage 做上下文窗口裁剪。
// ─────────────────────────────────────────────────────────────

export class MessageBuffer<T> {
  private readonly buffer: (T | undefined)[]
  private head = 0
  private _size = 0

  constructor(private readonly capacity: number) {
    if (capacity <= 0)
      throw new Error(`MessageBuffer capacity must be > 0, got ${capacity}`)
    this.buffer = Array.from({ length: capacity })
  }

  /** 追加元素，满时覆写最旧元素。 */
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this._size < this.capacity)
      this._size++
  }

  /** 按时间顺序返回全部元素（最旧在前）。 */
  getAll(): T[] {
    if (this._size === 0)
      return []

    const result: T[] = []
    const start = this._size < this.capacity ? 0 : this.head
    for (let i = 0; i < this._size; i++) {
      const item = this.buffer[(start + i) % this.capacity]
      if (item !== undefined)
        result.push(item)
    }
    return result
  }

  /** 返回最近 n 条（不足则返回全部）。 */
  getRecent(n: number): T[] {
    if (n <= 0)
      return []
    const all = this.getAll()
    return n >= all.length ? all : all.slice(-n)
  }

  /** 清空缓冲区。 */
  clear(): void {
    this.buffer.fill(undefined)
    this.head = 0
    this._size = 0
  }

  get size(): number {
    return this._size
  }
}
