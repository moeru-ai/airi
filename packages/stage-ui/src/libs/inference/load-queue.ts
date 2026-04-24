/**
 * Model loading queue.
 *
 * Ensures only one model loads at a time to prevent bandwidth
 * competition and GPU memory spikes. Higher priority loads
 * are dequeued first.
 *
 * Default priorities: TTS = 10, ASR = 5, BackgroundRemoval = 1.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueEntry<T> {
  modelId: string
  priority: number
  loader: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export interface LoadQueue {
  /**
   * Enqueue a model load. Returns a promise that resolves when
   * the loader completes. If another load is in progress, this
   * one waits in a priority queue.
   */
  enqueue: <T>(modelId: string, priority: number, loader: () => Promise<T>) => Promise<T>

  /** Model IDs waiting in the queue */
  readonly pending: string[]

  /** Model ID currently loading, or null */
  readonly active: string | null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLoadQueue(): LoadQueue {
  const queue: QueueEntry<any>[] = []
  let active: string | null = null
  let running = false

  async function processQueue(): Promise<void> {
    if (running)
      return
    running = true

    while (queue.length > 0) {
      // Sort by priority descending (highest first)
      queue.sort((a, b) => b.priority - a.priority)
      const entry = queue.shift()!

      active = entry.modelId
      try {
        const result = await entry.loader()
        entry.resolve(result)
      }
      catch (error) {
        entry.reject(error)
      }
    }

    active = null
    running = false
  }

  function enqueue<T>(
    modelId: string,
    priority: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ modelId, priority, loader, resolve, reject })
      processQueue()
    })
  }

  return {
    enqueue,
    get pending() { return queue.map(e => e.modelId) },
    get active() { return active },
  }
}

// ---------------------------------------------------------------------------
// Default priorities
// ---------------------------------------------------------------------------

export const LOAD_PRIORITY = {
  TTS: 10,
  ASR: 5,
  BACKGROUND_REMOVAL: 1,
} as const
