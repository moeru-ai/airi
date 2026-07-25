import { createContext, defineEventa } from '@moeru/eventa'

/**
 * Options for a one-shot event wait controller.
 *
 * @param TEvent - Event value fed to the wait controller.
 * @param TResult - Value resolved from the matching event.
 */
export interface EventWaitForOptions<TEvent, TResult = TEvent> {
  /** Predicate that decides whether an event should resolve the wait. @default () => true */
  match?: (event: TEvent) => boolean | Promise<boolean>
  /** Projects the matched event into the resolved value. @default event => event */
  select?: (event: TEvent) => TResult
  /** Milliseconds before the wait rejects. When omitted, no timeout is scheduled. */
  timeout?: number
  /** Abort signals that reject the wait when any signal aborts. */
  signals?: Array<AbortSignal | undefined>
  /** Runtime guard checked before handling and resolving events. @default () => true */
  isActive?: () => boolean
  /** Error message used when the wait aborts or becomes inactive. @default 'Wait aborted.' */
  abortMessage?: string
  /** Error message used when timeout expires. @default 'Timed out waiting for event.' */
  timeoutMessage?: string
}

/**
 * One-shot wait controller for callback-driven event sources.
 *
 * @param TEvent - Event value fed to the wait controller.
 * @param TResult - Value resolved from the matching event.
 */
export interface EventWaitFor<TEvent, TResult = TEvent> {
  /** Promise resolved by the first matching event, or rejected by abort/timeout/predicate errors. */
  promise: Promise<TResult>
  /** Emits one future event into the wait controller. */
  emit: (event: TEvent) => void
  /** Rejects the wait and releases timers/listeners when the caller abandons it. */
  dispose: (reason?: unknown) => void
}

function createWaitError(message: string, reason?: unknown) {
  if (reason instanceof Error) {
    return reason
  }

  return new Error(reason ? `${message}: ${String(reason)}` : message)
}

/**
 * Creates a promise plus emit pair for waiting on callback-driven events.
 *
 * Use when:
 * - An event source pushes values through callbacks, sets, or Eventa handlers
 * - The caller needs timeout, abort, predicate, and cleanup semantics around one future event
 *
 * Expects:
 * - Callers register {@link EventWaitFor.emit} with their event source and unregister it when the promise settles
 * - Matching starts only for future events emitted through the returned controller
 *
 * Returns:
 * - A one-shot wait controller that settles once and ignores later events
 */
export function createEventWaitFor<TEvent, TResult = TEvent>(
  options: EventWaitForOptions<TEvent, TResult> = {},
): EventWaitFor<TEvent, TResult> {
  const {
    match = () => true,
    select = (event: TEvent) => event as unknown as TResult,
    abortMessage = 'Wait aborted.',
    timeoutMessage = 'Timed out waiting for event.',
    signals = [],
  } = options

  const normalizedSignals = signals.filter((signal): signal is AbortSignal => signal != null)

  const events = createContext()
  const waitEvent = defineEventa<TEvent>('better-ws:wait-for-event')

  let settled = false

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let unsubscribe = () => {}

  let resolvePromise!: (value: TResult) => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<TResult>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const cleanup = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = undefined
    }

    for (const signal of normalizedSignals) {
      signal.removeEventListener('abort', abort)
    }

    unsubscribe()
    unsubscribe = () => {}
  }

  const settle = (run: () => void) => {
    if (settled) {
      return
    }

    settled = true
    cleanup()
    run()
  }

  function rejectWith(message: string, reason?: unknown) {
    settle(() => rejectPromise(createWaitError(message, reason)))
  }

  function abort() {
    rejectWith(abortMessage)
  }

  function assertActive() {
    if (options.isActive?.() === false) {
      rejectWith(abortMessage)
      return false
    }

    return true
  }

  unsubscribe = events.on(waitEvent, ({ body }) => {
    if (settled || !assertActive()) {
      return
    }

    // NOTICE:
    // Eventa payload wrappers expose an optional body field, but better-ws waits
    // allow undefined as a valid caller-owned event value. Use the property value
    // directly instead of treating missing truthiness as absent payload.
    const event = body as TEvent

    try {
      const matched = match(event)
      if (typeof matched === 'boolean') {
        if (matched && assertActive()) {
          settle(() => resolvePromise(select(event)))
        }
        return
      }

      void matched
        .then((asyncMatched) => {
          if (asyncMatched && assertActive()) {
            settle(() => resolvePromise(select(event)))
          }
        })
        .catch(error => rejectWith(abortMessage, error))
    }
    catch (error) {
      rejectWith(abortMessage, error)
    }
  })

  if (!assertActive() || normalizedSignals.some(signal => signal.aborted)) {
    rejectWith(abortMessage)
  }
  else {
    for (const signal of normalizedSignals) {
      signal.addEventListener('abort', abort, { once: true })
    }

    if (options.timeout !== undefined) {
      timeoutHandle = setTimeout(() => {
        rejectWith(timeoutMessage)
      }, options.timeout)
    }
  }

  return {
    promise,
    emit: event => events.emit(waitEvent, event),
    dispose: reason => rejectWith(abortMessage, reason),
  }
}
