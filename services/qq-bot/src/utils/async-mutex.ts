/**
 * 简单的 per-key 异步互斥锁。
 * 同一 key 的操作串行执行，不同 key 之间不阻塞。
 */
export class KeyedMutex {
  private readonly locks = new Map<string, Promise<void>>()

  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key)
    }

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(key, gate)

    return () => {
      this.locks.delete(key)
      release()
    }
  }
}
