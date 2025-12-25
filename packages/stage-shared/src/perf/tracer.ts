export interface TraceEvent {
  tracerId: string
  name: string
  ts: number
  duration?: number
  meta?: Record<string, any>
}

export type TraceSubscriber = (event: TraceEvent) => void

export interface PerfTracer {
  enable: () => void
  disable: () => void
  subscribe: (subscriber: TraceSubscriber) => () => void
  emit: (event: TraceEvent) => void
  mark: (tracerId: string, name: string, meta?: Record<string, any>) => void
  withMeasure: <T>(
    tracerId: string,
    name: string,
    fn: () => Promise<T> | T,
    meta?: Record<string, any>,
  ) => Promise<T>
}

export function createPerfTracer(): PerfTracer {
  let enabled = false
  let leaseCount = 0
  const subscribers = new Set<TraceSubscriber>()

  function enable() {
    leaseCount += 1
    enabled = leaseCount > 0
  }

  function disable() {
    leaseCount = Math.max(0, leaseCount - 1)
    enabled = leaseCount > 0
  }

  function subscribe(subscriber: TraceSubscriber) {
    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
  }

  function emit(event: TraceEvent) {
    if (!enabled)
      return

    for (const subscriber of subscribers)
      subscriber(event)
  }

  function mark(tracerId: string, name: string, meta?: Record<string, any>) {
    emit({
      tracerId,
      name,
      ts: performance.now(),
      meta,
    })
  }

  async function withMeasure<T>(
    tracerId: string,
    name: string,
    fn: () => Promise<T> | T,
    meta?: Record<string, any>,
  ) {
    const start = performance.now()
    try {
      return await fn()
    }
    finally {
      emit({
        tracerId,
        name,
        ts: start,
        duration: performance.now() - start,
        meta,
      })
    }
  }

  return {
    enable,
    disable,
    subscribe,
    emit,
    mark,
    withMeasure,
  }
}

// Default singleton used across surfaces. Devtools should call enable/disable explicitly.
export const defaultPerfTracer = createPerfTracer()
