export interface LatestOptions<T> {
  /**
   * Values with an equal key (`Object.is`) are the same input. A repeated key keeps the active run.
   * Omission treats every pushed value as new.
   */
  readonly key?: (value: T) => unknown
  /** Waits until no new key arrives for this long, then runs. @default 0 */
  readonly debounceMs?: number
  /** Closes the runner. */
  readonly signal?: AbortSignal
  /** Receives errors from runs that were not superseded or closed. */
  readonly onError?: (error: unknown) => void
}

/**
 * Runs work for the newest input only, like `switchMap`.
 *
 * Each new key aborts the active run and replaces any waiting input. A run sees one value and one signal. The signal
 * aborts when a newer key arrives or the runner closes. Errors after that abort are expected and not reported.
 */
export interface Latest<T> {
  push: (value: T) => void
  /** Drops an input that waits for its debounce. The active run continues. */
  cancelPending: () => void
  /** Resolves when no run is active or waiting. */
  idle: () => Promise<void>
  close: (reason?: string) => void
}

/**
 * Creates a runner that keeps only the newest input.
 *
 * @example
 * const runner = createLatest<string>(async (text, signal) => cache.set(text, await rephrase(text, signal)), { debounceMs: 600 })
 * runner.push('hello')
 * runner.push('hello world') // aborts the run for 'hello'
 */
export function createLatest<T>(run: (value: T, signal: AbortSignal) => Promise<void> | void, options: LatestOptions<T> = {}): Latest<T> {
  const debounceMs = options.debounceMs ?? 0
  if (!Number.isFinite(debounceMs) || debounceMs < 0)
    throw new Error('Debounce must be finite and nonnegative')

  const closed = new AbortController()
  const key = options.key ?? ((value: T) => value)
  // `lastKey` is the key of the waiting or active input. `none` means no input, so any next key is new.
  const none = Symbol('none')
  let lastKey: unknown = none
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: AbortController | undefined
  let running: Promise<void> | undefined
  let waiting = Promise.withResolvers<void>()
  let pending = false

  function settleIfIdle() {
    if (!pending && !running) {
      waiting.resolve()
      waiting = Promise.withResolvers<void>()
    }
  }

  function start(value: T) {
    pending = false
    const controller = new AbortController()
    active = controller
    const signal = AbortSignal.any([controller.signal, closed.signal])
    const current = (async () => {
      try {
        await run(value, signal)
      }
      catch (error) {
        if (!signal.aborted)
          options.onError?.(error)
      }
      finally {
        if (active === controller) {
          active = undefined
          running = undefined
        }
        settleIfIdle()
      }
    })()
    running = current
  }

  function push(value: T) {
    if (closed.signal.aborted)
      return

    const next = key(value)
    if (Object.is(next, lastKey))
      return

    lastKey = next
    clearTimeout(timer)
    active?.abort('Superseded by a newer input')
    active = undefined
    running = undefined
    pending = true
    if (debounceMs > 0)
      timer = setTimeout(start, debounceMs, value)
    else
      start(value)
  }

  function cancelPending() {
    if (!pending || running)
      return
    clearTimeout(timer)
    pending = false
    lastKey = none
    settleIfIdle()
  }

  function close(reason = 'Runner closed') {
    if (closed.signal.aborted)
      return

    clearTimeout(timer)
    pending = false
    closed.abort(reason)
    active = undefined
    running = undefined
    settleIfIdle()
  }

  options.signal?.addEventListener('abort', () => close(typeof options.signal?.reason === 'string' ? options.signal.reason : undefined), { once: true, signal: closed.signal })
  if (options.signal?.aborted)
    close()

  return {
    push,
    cancelPending,
    idle: () => (pending || running) ? waiting.promise : Promise.resolve(),
    close,
  }
}
