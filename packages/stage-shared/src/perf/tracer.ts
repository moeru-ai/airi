export interface PerfTracer {
  acquire: (token?: string) => () => void
  emit: (event: TraceEvent) => void
  forceDisable: () => void
  isEnabled: () => boolean
  mark: (tracerId: string, name: string, meta?: Record<string, any>) => void
  release: (token?: string) => void
  subscribe: (subscriber: TraceSubscriber) => () => void
  subscribeSafe: (
    subscriber: TraceSubscriber,
    options?: { label?: string, onError?: (error: unknown, event: TraceEvent) => void },
  ) => () => void
  withMeasure: <T>(
    tracerId: string,
    name: string,
    fn: () => Promise<T> | T,
    meta?: Record<string, any>,
  ) => Promise<T>
}

export interface TraceEvent {
  duration?: number
  meta?: Record<string, any>
  name: string
  tracerId: string
  ts: number
}

export type TraceSubscriber = (event: TraceEvent) => void

export function createPerfTracer(): PerfTracer {
  let enabled = false
  const leases = new Map<string, number>()
  const subscribers = new Set<TraceSubscriber>()

  function push(event: TraceEvent, force = false) {
    if (!enabled && !force)
      return

    for (const subscriber of subscribers)
      subscriber(event)
  }

  function recomputeEnabled() {
    let total = 0
    for (const count of leases.values())
      total += count
    enabled = total > 0
  }

  function acquire(token = '__default__') {
    const next = (leases.get(token) ?? 0) + 1
    leases.set(token, next)
    recomputeEnabled()
    return () => release(token)
  }

  function release(token = '__default__') {
    const current = leases.get(token) ?? 0
    if (current <= 1)
      leases.delete(token)
    else
      leases.set(token, current - 1)
    recomputeEnabled()
  }

  function forceDisable() {
    leases.clear()
    enabled = false
  }

  function isEnabled() {
    return enabled
  }

  function subscribe(subscriber: TraceSubscriber) {
    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
  }

  function subscribeSafe(
    subscriber: TraceSubscriber,
    options?: { label?: string, onError?: (error: unknown, event: TraceEvent) => void },
  ) {
    const wrapped: TraceSubscriber = (event) => {
      try {
        subscriber(event)
      }
      catch (error) {
        if (options?.onError)
          options.onError(error, event)
        else
          console.error(`[PerfTracer] subscriber${options?.label ? ` (${options.label})` : ''} threw`, error, event)
      }
    }
    return subscribe(wrapped)
  }

  function emit(event: TraceEvent) {
    push(event, false)
  }

  function mark(tracerId: string, name: string, meta?: Record<string, any>) {
    push({
      meta,
      name,
      tracerId,
      ts: performance.now(),
    }, false)
  }

  async function withMeasure<T>(
    tracerId: string,
    name: string,
    fn: () => Promise<T> | T,
    meta?: Record<string, any>,
  ) {
    const shouldEmit = enabled
    if (!shouldEmit)
      return fn()

    const start = performance.now()
    try {
      return await fn()
    }
    finally {
      const disabledAtEnd = !enabled
      push({
        duration: performance.now() - start,
        meta: disabledAtEnd
          ? { ...meta, tracerDisabledDuringMeasure: true }
          : meta,
        name,
        tracerId,
        ts: start,
      }, true)
    }
  }

  return {
    acquire,
    emit,
    forceDisable,
    isEnabled,
    mark,
    release,
    subscribe,
    subscribeSafe,
    withMeasure,
  }
}

// Default singleton used across surfaces. Devtools should call enable/disable explicitly.
export const defaultPerfTracer = createPerfTracer()
