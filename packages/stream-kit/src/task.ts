/** The result of one task. Cancellation and failure carry their cause. */
export type Outcome<T = void>
  = { readonly status: 'finished', readonly value: T }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

export interface TaskOptions {
  /** The task cancels when this signal aborts. */
  readonly signal?: AbortSignal
  /** The task fails with a timeout error after this many milliseconds. Omission adds no timeout. */
  readonly timeoutMs?: number
  /** Receives cleanup errors. Cleanup errors never change the outcome. */
  readonly onCleanupError?: (error: unknown) => void
}

/**
 * One unit of work with one outcome.
 *
 * `signal` aborts on cancellation, failure, or timeout. It does not abort on `finish`, so work that the task
 * handed off, for example queued playback, continues. Deferred cleanups run once, in reverse order, after the
 * outcome is set.
 */
export interface Task<T = void> {
  readonly signal: AbortSignal
  readonly done: Promise<Outcome<T>>
  /** Resolves after every deferred cleanup has settled. */
  readonly closed: Promise<void>
  /** True after the first of `finish`, `cancel`, or `fail`. */
  readonly settled: boolean
  /** Registers cleanup. A cleanup registered after settlement runs at once. */
  defer: (cleanup: () => unknown) => void
  finish: (value: T) => void
  cancel: (reason: string) => void
  fail: (error: Error) => void
}

function reasonFrom(value: unknown, fallback: string) {
  if (typeof value === 'string')
    return value
  if (value instanceof Error)
    return value.message
  return fallback
}

/**
 * Creates a task that settles by an explicit call.
 *
 * @example
 * const task = createTask<string>({ signal: parent.signal, timeoutMs: 5000 })
 * task.defer(() => socket.close())
 * task.finish('ok')
 * await task.done // => { status: 'finished', value: 'ok' }
 */
export function createTask<T = void>(options: TaskOptions = {}): Task<T> {
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0))
    throw new Error('Task timeout must be finite and nonnegative')

  const controller = new AbortController()
  const completion = Promise.withResolvers<Outcome<T>>()
  const cleanups: (() => unknown)[] = []
  const cleaned = Promise.withResolvers<void>()
  const onCleanupError = options.onCleanupError ?? console.error
  const parent = options.signal
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function runCleanups() {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        await cleanup()
      }
      catch (error) {
        onCleanupError(error)
      }
    }
    cleaned.resolve()
  }

  function settle(outcome: Outcome<T>) {
    if (settled)
      return

    settled = true
    clearTimeout(timer)
    parent?.removeEventListener('abort', onParentAbort)
    if (outcome.status !== 'finished')
      controller.abort(outcome.status === 'failed' ? outcome.error : outcome.reason)
    completion.resolve(outcome)
    void runCleanups()
  }

  function onParentAbort() {
    settle({ status: 'cancelled', reason: reasonFrom(parent?.reason, 'Parent task closed') })
  }

  const task: Task<T> = {
    signal: controller.signal,
    done: completion.promise,
    closed: cleaned.promise,
    get settled() {
      return settled
    },
    defer(cleanup) {
      if (settled)
        void Promise.resolve().then(cleanup).catch(onCleanupError)
      else
        cleanups.push(cleanup)
    },
    finish: value => settle({ status: 'finished', value }),
    cancel: reason => settle({ status: 'cancelled', reason }),
    fail: error => settle({ status: 'failed', error }),
  }

  if (parent?.aborted) {
    onParentAbort()
    return task
  }
  parent?.addEventListener('abort', onParentAbort, { once: true })

  if (options.timeoutMs !== undefined)
    timer = setTimeout(() => task.fail(new Error('Task timed out')), options.timeoutMs)

  return task
}

/**
 * Runs `work` as one task. The returned value finishes the task, and a thrown error fails it.
 * A call to `cancel` or `fail` inside `work` wins over its later return.
 *
 * @example
 * const task = runTask(async ({ signal }) => fetch(url, { signal }).then(response => response.text()))
 * const outcome = await task.done
 */
export function runTask<T>(work: (task: Task<T>) => Promise<T> | T, options: TaskOptions = {}): Task<T> {
  const task = createTask<T>(options)
  if (task.settled)
    return task

  void (async () => {
    try {
      task.finish(await work(task))
    }
    catch (cause) {
      task.fail(cause instanceof Error ? cause : new Error('Task failed', { cause }))
    }
  })()
  return task
}

/**
 * Merges outcomes. A failure wins over a cancellation, and a cancellation wins over success.
 *
 * @example
 * worstOutcome([{ status: 'finished', value: undefined }, { status: 'cancelled', reason: 'Closed' }])
 * // => { status: 'cancelled', reason: 'Closed' }
 */
export function worstOutcome(outcomes: readonly Outcome<unknown>[]): Outcome {
  const failed = outcomes.find(outcome => outcome.status === 'failed')
  if (failed)
    return failed
  const cancelled = outcomes.find(outcome => outcome.status === 'cancelled')
  return cancelled ?? { status: 'finished', value: undefined }
}
