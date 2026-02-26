import { AsyncLocalStorage } from 'node:async_hooks'

import { nanoid } from 'nanoid'

export type EventId = string
export type TraceId = string

export interface EventSource {
  readonly component: string
  readonly id?: string
}

export interface TracedEvent<T = unknown> {
  readonly id: EventId
  readonly traceId: TraceId
  readonly parentId?: EventId
  readonly type: string
  readonly payload: Readonly<T>
  readonly timestamp: number
  readonly source: EventSource
}

export interface EventInput<T = unknown> {
  readonly type: string
  readonly payload: Readonly<T>
  readonly source: EventSource
  readonly traceId?: string
  readonly parentId?: string
}

export type EventHandler<T = unknown> = (event: TracedEvent<T>) => void
export type Unsubscribe = () => void
export type EventPattern = string

interface TraceContext {
  traceId: string
  parentId?: string
}

interface Subscription {
  pattern: EventPattern
  handler: EventHandler
}

const traceStorage = new AsyncLocalStorage<TraceContext>()

function generateEventId(): string {
  return nanoid(12)
}

function generateTraceId(): string {
  return nanoid(16)
}

function matchesPattern(pattern: EventPattern, eventType: string): boolean {
  if (pattern === '*')
    return true

  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1)
    return eventType.startsWith(prefix)
  }

  return pattern === eventType
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return value

  if (Array.isArray(value)) {
    for (const item of value)
      deepFreeze(item)
    return Object.freeze(value)
  }

  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child)

  return Object.freeze(value)
}

function resolveTraceContext(input: Pick<EventInput, 'traceId' | 'parentId'>): TraceContext {
  if (input.traceId) {
    return Object.freeze({
      traceId: input.traceId,
      parentId: input.parentId,
    })
  }

  const inherited = traceStorage.getStore()
  if (inherited) {
    return Object.freeze({
      traceId: inherited.traceId,
      parentId: inherited.parentId,
    })
  }

  return Object.freeze({ traceId: generateTraceId() })
}

function withTraceContext<T>(traceId: string, parentId: string, fn: () => T): T {
  return traceStorage.run({ traceId, parentId }, fn)
}

export class EventBus {
  private readonly subscriptions = new Map<number, Subscription>()
  private nextSubId = 0

  public emit<T>(input: EventInput<T>): TracedEvent<T> {
    const trace = resolveTraceContext({
      traceId: input.traceId,
      parentId: input.parentId,
    })

    const event = deepFreeze({
      id: generateEventId(),
      traceId: trace.traceId,
      parentId: trace.parentId,
      type: input.type,
      payload: input.payload,
      timestamp: Date.now(),
      source: input.source,
    } satisfies TracedEvent<T>)

    this.dispatch(event)
    return event
  }

  public emitChild<T>(
    parent: TracedEvent,
    input: Omit<EventInput<T>, 'traceId' | 'parentId'>,
  ): TracedEvent<T> {
    return this.emit({
      ...input,
      traceId: parent.traceId,
      parentId: parent.id,
    })
  }

  public subscribe<T = unknown>(
    pattern: EventPattern,
    handler: EventHandler<T>,
  ): Unsubscribe {
    const id = this.nextSubId++
    this.subscriptions.set(id, {
      pattern,
      handler: handler as EventHandler,
    })

    return () => {
      this.subscriptions.delete(id)
    }
  }

  private dispatch(event: TracedEvent): void {
    for (const sub of this.subscriptions.values()) {
      if (!matchesPattern(sub.pattern, event.type))
        continue

      try {
        withTraceContext(event.traceId, event.id, () => {
          sub.handler(event)
        })
      }
      catch {
        // Keep dispatch resilient by isolating subscriber failures.
      }
    }
  }
}

export function createEventBus(): EventBus {
  return new EventBus()
}
