/**
 * Core types for the Cognitive OS event-sourced architecture.
 * All types are immutable by design (Readonly).
 */

/**
 * Unique identifier for events and traces
 */
export type EventId = string
export type TraceId = string

/**
 * Event source identifier
 */
export interface EventSource {
  readonly component: string
  readonly id?: string
}

/**
 * A traced event - the core unit of the event-sourced system.
 * All fields are readonly to enforce immutability.
 */
export interface TracedEvent<T = unknown> {
  /** Unique event ID */
  readonly id: EventId
  /** Trace ID shared across related events */
  readonly traceId: TraceId
  /** Parent event ID (if derived from another event) */
  readonly parentId?: EventId
  /** Event type identifier (e.g. 'raw:sighted:arm_swing') */
  readonly type: string
  /** Event payload - should be immutable */
  readonly payload: Readonly<T>
  /** Event timestamp */
  readonly timestamp: number
  /** Source component */
  readonly source: EventSource
}

/**
 * Input for creating a new event
 * traceId and parentId are optional - will be auto-generated or inherited from context
 * id and timestamp are always auto-generated
 */
export interface EventInput<T = unknown> {
  readonly type: string
  readonly payload: Readonly<T>
  readonly source: EventSource
  readonly traceId?: string
  readonly parentId?: string
}

/**
 * Event handler function - should be a pure function that may emit new events
 */
export type EventHandler<T = unknown> = (event: TracedEvent<T>) => void

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void

/**
 * Event pattern for subscription filtering
 * Supports wildcards: 'raw:*' matches 'raw:sighted:punch'
 */
export type EventPattern = string

/**
 * Subscription record
 */
export interface Subscription {
  readonly pattern: EventPattern
  readonly handler: EventHandler
}

/**
 * EventBus configuration
 */
export interface EventBusConfig {
  /** Maximum events to keep in history (ring buffer) */
  readonly historySize: number
}

/**
 * Snapshot of EventBus state for debugging
 */
export interface EventBusSnapshot {
  readonly events: readonly TracedEvent[]
  readonly subscriptionCount: number
}

/**
 * Trace context for propagating trace information
 */
export interface TraceContext {
  readonly traceId: TraceId
  readonly parentId?: EventId
}

/**
 * Deep freeze an object (recursively freeze all nested objects)
 * Performance note: Use sparingly on large objects
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // Don't freeze already frozen objects
  if (Object.isFrozen(obj)) {
    return obj
  }

  // Freeze arrays
  if (Array.isArray(obj)) {
    obj.forEach(item => deepFreeze(item))
    return Object.freeze(obj) as Readonly<T>
  }

  // Freeze object properties
  Object.keys(obj).forEach((key) => {
    const value = (obj as Record<string, unknown>)[key]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  })

  return Object.freeze(obj)
}

/**
 * Create an immutable event by deep freezing all its properties
 * This ensures the entire object tree is immutable
 */
export function freezeEvent<T>(event: TracedEvent<T>): TracedEvent<T> {
  return deepFreeze(event)
}
