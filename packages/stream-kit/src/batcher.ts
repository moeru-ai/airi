/** Runs `callback` after `delayMs`. Returns a function that cancels the run. */
export type BatchScheduler = (callback: () => void, delayMs: number) => () => void

export interface BatcherOptions<T> {
  /** The longest time that the first pending item waits before a flush. */
  readonly maxWaitMs: number
  /** Flushes at once when this many items wait. @default Infinity */
  readonly maxItems?: number
  /** Receives each nonempty batch, in push order. A push inside `flush` starts a new batch. */
  readonly flush: (items: T[]) => void
  /**
   * The current time. When given, a push after the deadline of the batch flushes at once, also when the timer runs
   * late, for example in a throttled background tab. Omission leaves the deadline to the timer only.
   */
  readonly now?: () => number
  /** Starts the wait timer. @default a `setTimeout` and `clearTimeout` pair */
  readonly schedule?: BatchScheduler
}

export interface Batcher<T> {
  push: (item: T) => void
  /** Flushes the pending items now. Does nothing when no item waits. */
  flush: () => void
  /** Flushes the pending items and ignores later pushes. */
  close: () => void
}

const scheduleTimeout: BatchScheduler = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

/**
 * Groups items into batches, like `groupedWithin`. A batch flushes when it has `maxItems` items, or `maxWaitMs`
 * after its first item, whichever comes first.
 *
 * @example
 * const batcher = createBatcher<TraceRecord>({ maxWaitMs: 50, maxItems: 500, flush: records => send({ records }) })
 * batcher.push(record)
 */
export function createBatcher<T>(options: BatcherOptions<T>): Batcher<T> {
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY
  if (!Number.isFinite(options.maxWaitMs) || options.maxWaitMs < 0)
    throw new Error('maxWaitMs must be finite and nonnegative')
  if (maxItems < 1)
    throw new Error('maxItems must be at least 1')

  const schedule = options.schedule ?? scheduleTimeout
  let items: T[] = []
  let deadline = 0
  let cancelTimer: (() => void) | undefined
  let closed = false

  function flush() {
    cancelTimer?.()
    cancelTimer = undefined
    if (items.length === 0)
      return
    // Take the batch before the callback, so that a push inside it starts a new batch.
    const batch = items
    items = []
    options.flush(batch)
  }

  function push(item: T) {
    if (closed)
      return
    if (items.length > 0 && options.now && options.now() >= deadline)
      flush()

    items.push(item)
    if (items.length >= maxItems) {
      flush()
      return
    }
    if (items.length === 1) {
      deadline = (options.now?.() ?? 0) + options.maxWaitMs
      cancelTimer = schedule(flush, options.maxWaitMs)
    }
  }

  return {
    push,
    flush,
    close() {
      closed = true
      flush()
    },
  }
}
