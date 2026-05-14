/**
 * Model loading queue.
 *
 * Ensures only one model loads at a time to prevent bandwidth
 * competition and GPU memory spikes. Higher priority loads
 * are dequeued first.
 *
 * Default priorities: TTS = 10, ASR = 5, BackgroundRemoval = 1.
 *
 * Cancellation: pass an `AbortSignal` in `enqueueOptions` to `enqueue()`.
 * When aborted, the entry is removed from the pending queue (if not yet
 * active) and its promise is rejected with `InferenceAbortError`. If the
 * entry is already running, the loader itself is responsible for honoring
 * the same signal and rejecting accordingly — the queue cannot interrupt
 * an in-flight async loader.
 */

import { InferenceAbortError } from './protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueEntry<T> {
  modelId: string
  priority: number
  loader: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  signal?: AbortSignal
  abortHandler?: () => void
}

export interface EnqueueOptions {
  /** Abort the enqueued load. Rejects the returned promise with `InferenceAbortError`. */
  signal?: AbortSignal
}

export interface LoadQueue {
  /**
   * Enqueue a model load. Returns a promise that resolves when
   * the loader completes. If another load is in progress, this
   * one waits in a priority queue.
   */
  enqueue: <T>(
    modelId: string,
    priority: number,
    loader: () => Promise<T>,
    options?: EnqueueOptions,
  ) => Promise<T>

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

  function detachAbortHandler(entry: QueueEntry<any>): void {
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener('abort', entry.abortHandler)
      entry.abortHandler = undefined
    }
  }

  async function processQueue(): Promise<void> {
    if (running)
      return
    running = true

    while (queue.length > 0) {
      // Sort by priority descending (highest first)
      queue.sort((a, b) => b.priority - a.priority)
      const entry = queue.shift()!

      // Skip already-aborted entries (the abort handler may have fired
      // before this dequeue; it removes the entry from the array but we
      // also guard here in case of races)
      if (entry.signal?.aborted) {
        detachAbortHandler(entry)
        const reason = entry.signal.reason
        entry.reject(reason instanceof Error ? reason : new InferenceAbortError())
        continue
      }

      active = entry.modelId
      try {
        const result = await entry.loader()
        detachAbortHandler(entry)
        entry.resolve(result)
      }
      catch (error) {
        detachAbortHandler(entry)
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
    options?: EnqueueOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        modelId,
        priority,
        loader,
        resolve,
        reject,
        signal: options?.signal,
      }

      if (options?.signal) {
        if (options.signal.aborted) {
          const reason = options.signal.reason
          reject(reason instanceof Error ? reason : new InferenceAbortError())
          return
        }
        entry.abortHandler = () => {
          // Remove from pending queue if still there. If the entry has
          // already been dequeued (active load), the loader's own abort
          // propagation will handle rejection.
          const idx = queue.indexOf(entry)
          if (idx >= 0) {
            queue.splice(idx, 1)
            const reason = options.signal!.reason
            reject(reason instanceof Error ? reason : new InferenceAbortError())
          }
        }
        options.signal.addEventListener('abort', entry.abortHandler)
      }

      queue.push(entry)
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
