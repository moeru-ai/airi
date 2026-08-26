import { AsyncLocalStorage } from 'node:async_hooks'

import { nanoid } from 'nanoid'

export interface EventBusOptions {
  readonly onSubscriberError?: (error: EventBusSubscriberError) => void
}
export interface EventBusSubscriberError {
  readonly error: unknown
  readonly event: TracedEvent
  readonly pattern: EventPattern
}

export type EventHandler<T = unknown> = (event: TracedEvent<T>) => void

export type EventId = string

export interface EventInput<T = unknown> {
  readonly parentId?: string
  readonly payload: Readonly<T>
  readonly source: EventSource
  readonly traceId?: string
  readonly type: string
}

export type EventPattern = string
export interface EventSource {
  readonly component: string
  readonly id?: string
}
export interface TracedEvent<T = unknown> {
  readonly id: EventId
  readonly parentId?: EventId
  readonly payload: Readonly<T>
  readonly source: EventSource
  readonly timestamp: number
  readonly traceId: TraceId
  readonly type: string
}

export type TraceId = string

export type Unsubscribe = () => void

interface Subscription {
  handler: EventHandler
  pattern: EventPattern
}

interface TraceContext {
  parentId?: string
  traceId: string
}

const traceStorage = new AsyncLocalStorage<TraceContext>()

export class EventBus {
  private nextSubId = 0
  private readonly onSubscriberError: (error: EventBusSubscriberError) => void
  private readonly subscriptions = new Map<number, Subscription>()

  public constructor(options: EventBusOptions = {}) {
    this.onSubscriberError = options.onSubscriberError ?? defaultSubscriberErrorReporter
  }

  public emit<T>(input: EventInput<T>): TracedEvent<T> {
    const trace = resolveTraceContext({
      parentId: input.parentId,
      traceId: input.traceId,
    })

    const event = deepFreeze({
      id: generateEventId(),
      parentId: trace.parentId,
      payload: input.payload,
      source: input.source,
      timestamp: Date.now(),
      traceId: trace.traceId,
      type: input.type,
    } satisfies TracedEvent<T>)

    this.dispatch(event)
    return event
  }

  public emitChild<T>(
    parent: TracedEvent,
    input: Omit<EventInput<T>, 'parentId' | 'traceId'>,
  ): TracedEvent<T> {
    return this.emit({
      ...input,
      parentId: parent.id,
      traceId: parent.traceId,
    })
  }

  public subscribe<T = unknown>(
    pattern: EventPattern,
    handler: EventHandler<T>,
  ): Unsubscribe {
    const id = this.nextSubId++
    this.subscriptions.set(id, {
      handler: handler as EventHandler,
      pattern,
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
      catch (error) {
        // Keep dispatch resilient by isolating subscriber failures.
        try {
          this.onSubscriberError({
            error,
            event,
            pattern: sub.pattern,
          })
        }
        catch (reporterError) {
          defaultSubscriberErrorReporter({
            error: reporterError,
            event,
            pattern: sub.pattern,
          })
        }
      }
    }
  }
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  return new EventBus(options)
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

function defaultSubscriberErrorReporter(error: EventBusSubscriberError): void {
  console.error(
    `[EventBus] subscriber failed for event "${error.event.type}" (pattern: "${error.pattern}")`,
    error.error,
  )
}

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

function resolveTraceContext(input: Pick<EventInput, 'parentId' | 'traceId'>): TraceContext {
  if (input.traceId) {
    return Object.freeze({
      parentId: input.parentId,
      traceId: input.traceId,
    })
  }

  const inherited = traceStorage.getStore()
  if (inherited) {
    return Object.freeze({
      parentId: inherited.parentId,
      traceId: inherited.traceId,
    })
  }

  return Object.freeze({ traceId: generateTraceId() })
}

function withTraceContext<T>(traceId: string, parentId: string, fn: () => T): T {
  return traceStorage.run({ parentId, traceId }, fn)
}
