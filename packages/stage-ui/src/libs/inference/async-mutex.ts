/**
 * An async mutex that ensures only one callback runs at a time.
 * Waiters queue up and are processed in FIFO order.
 *
 * Extracted from KokoroWorkerManager for reuse across inference workers.
 */
export class AsyncMutex {
  private locked = false
  private waiters: { resolve: () => void, reject: (error: Error) => void }[] = []

  // Incremented on reset() to invalidate stale lock holders
  private generation = 0

  /**
   * Executes the callback with exclusive access to the mutex.
   * If the mutex is locked, waits in queue until it's our turn.
   */
  async run<T>(callback: () => Promise<T> | T): Promise<T> {
    const myGeneration = this.generation

    if (this.locked) {
      await new Promise<void>((resolve, reject) => {
        this.waiters.push({ resolve, reject })
      })
      if (myGeneration !== this.generation) {
        throw new Error('Mutex was reset')
      }
    }
    this.locked = true

    try {
      return await callback()
    }
    finally {
      if (myGeneration === this.generation) {
        const next = this.waiters.shift()
        if (next) {
          next.resolve()
        }
        else {
          this.locked = false
        }
      }
    }
  }

  /**
   * Cancels all waiting tasks and releases the lock.
   * Atomic thanks to JavaScript's Run-To-Completion semantics.
   */
  reset(error: Error = new Error('Mutex reset')): void {
    this.generation++
    this.locked = false

    const waitersToReject = this.waiters
    this.waiters = []

    for (const waiter of waitersToReject) {
      waiter.reject(error)
    }
  }
}
