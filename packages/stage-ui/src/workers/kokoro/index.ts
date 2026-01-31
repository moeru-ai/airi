/**
 * Kokoro TTS Worker Manager
 * Manages communication with the Kokoro TTS worker thread
 */

/**
 * An async mutex that ensures only one callback runs at a time.
 * Waiters queue up and are processed in FIFO order.
 */
class AsyncMutex {
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

function waitForEvent<T extends Event>(
  element: EventTarget,
  eventName: string,
  predicate: (event: T) => boolean = () => true,
  callback: (event: T) => void = () => {},
): Promise<T> {
  return new Promise((resolve) => {
    const listener = (event: Event) => {
      const typedEvent = event as T

      if (predicate(typedEvent)) {
        element.removeEventListener(eventName, listener)
        resolve(typedEvent)
      }
      else {
        callback(typedEvent)
      }
    }

    element.addEventListener(eventName, listener)
  })
}

export class KokoroWorkerManager {
  private worker: Worker | null = null
  private asyncMutex: AsyncMutex
  private workerLifecycleAsyncMutex: AsyncMutex
  private voices = null

  private restartAttempts = 0
  private readonly maxRestartAttempts = 3
  private readonly restartDelayMs = 1000

  constructor() {
    this.workerLifecycleAsyncMutex = new AsyncMutex()
    this.asyncMutex = new AsyncMutex()
  }

  public async start(): Promise<void> {
    await this.workerLifecycleAsyncMutex.run(async () => {
      // Only initialize if not already running
      if (!this.worker) {
        this.initializeWorker()
      }
    })
  }

  private initializeWorker(): void {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.addEventListener('error', (event) => {
      this.handleWorkerError(event)
    })
  }

  private handleWorkerError(event: ErrorEvent): void {
    const error = new Error(event.message || 'An unknown worker error occurred')

    // Reject all pending operations
    this.asyncMutex.reset(error)

    // Clean up current worker
    this.terminate()

    // Attempt restart with backoff
    this.scheduleRestart()
  }

  private scheduleRestart(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(
        `[KokoroWorker] Max restart attempts (${this.maxRestartAttempts}) reached. Giving up.`,
      )
      return
    }

    this.restartAttempts++
    const delay = this.restartDelayMs * this.restartAttempts // Linear backoff

    console.warn(
      `[KokoroWorker] Restarting worker in ${delay}ms (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`,
    )

    setTimeout(() => {
      this.start().catch((err) => {
        console.error('[KokoroWorker] Failed to restart worker:', err)
      })
    }, delay)
  }

  // Call this after successful operations to reset the counter
  private onSuccessfulOperation(): void {
    this.restartAttempts = 0
  }

  async loadModel(quantization: string, device: string, options?: { onProgress?: (progress: any) => void }): Promise<any> {
    // Lazy-start the worker if not already initialized
    await this.start()
    return await this.asyncMutex.run(async () => {
      const voicePromise = waitForEvent<MessageEvent>(
        this.worker!,
        'message',
        event => event.data.type === 'loaded',
        (event) => {
          if (event.data.type === 'progress' && options?.onProgress) {
            options.onProgress(event.data.progress)
          }
        },
      )
      this.worker!.postMessage({
        type: 'load',
        data: { quantization, device },
      })
      const event = await voicePromise
      this.voices = event.data.voices
      this.onSuccessfulOperation()
      return this.voices
    })
  }

  async generate(text: string, voice: string): Promise<ArrayBuffer> {
    return await this.asyncMutex.run(async () => {
      if (!this.worker) {
        throw new Error('Worker not initialized. Call start() first.')
      }

      const resultPromise = waitForEvent<MessageEvent>(this.worker, 'message')
      this.worker.postMessage({
        type: 'generate',
        data: { text, voice },
      })
      const event = await resultPromise

      switch (event.data.status) {
        case 'success':
          this.onSuccessfulOperation()
          return event.data.buffer
        case 'error':
          throw new Error(event.data.message)
        default:
          throw new Error(`Unexpected response status: ${event.data.status}`)
      }
    })
  }

  getVoices(): any {
    if (!this.voices) {
      throw new Error('Model not loaded. Call loadModel() first.')
    }
    return this.voices
  }

  private terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.voices = null
  }
}

let globalWorkerManager: KokoroWorkerManager | null = null
const globalWorkerManagerGetterLock: AsyncMutex = new AsyncMutex()

export async function getKokoroWorker(): Promise<KokoroWorkerManager> {
  return globalWorkerManagerGetterLock.run(async () => {
    if (!globalWorkerManager) {
      globalWorkerManager = new KokoroWorkerManager()
      await globalWorkerManager.start()
    }
    return globalWorkerManager
  })
}
