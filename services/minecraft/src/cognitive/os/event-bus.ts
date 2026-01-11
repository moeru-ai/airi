import type { Logg } from '@guiiai/logg'

import type {
  EventBusConfig,
  EventBusSnapshot,
  EventHandler,
  EventInput,
  EventPattern,
  Subscription,
  TraceContext,
  TracedEvent,
  Unsubscribe,
} from './types'

import {
  deriveTraceContext,
  generateEventId,
  resolveTraceContext,
  runWithTraceContext,
} from './tracer'
import { freezeEvent } from './types'

/**
 * Default EventBus configuration
 */
const DEFAULT_CONFIG: EventBusConfig = Object.freeze({
  historySize: 10000,
})

/**
 * Check if an event type matches a pattern
 * Supports wildcards: 'raw:*' matches 'raw:sighted:punch'
 */
function matchesPattern(pattern: EventPattern, eventType: string): boolean {
  if (pattern === '*')
    return true

  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1) // Remove the '*'
    return eventType.startsWith(prefix)
  }

  return pattern === eventType
}

/**
 * EventBus - The heart of the Cognitive OS
 *
 * This is the ONLY component with mutable internal state.
 * All other components should be pure functions that interact
 * through the EventBus.
 *
 * Design principles:
 * - Events are immutable once created
 * - Trace context automatically propagates through handlers
 * - Ring buffer prevents memory leaks
 * - Pattern-based subscriptions for flexible routing
 */
export class EventBus {
  // Internal mutable state - isolated from the outside world
  private readonly buffer: (TracedEvent | null)[] = []
  private readonly subscriptions = new Map<number, Subscription>()
  private nextSubId = 0
  private writeIndex = 0 // Next position to write
  private count = 0 // Number of events stored

  constructor(
    private readonly deps: {
      logger: Logg
      config?: Partial<EventBusConfig>
    },
  ) {
    // Pre-allocate buffer
    const size = this.config.historySize
    this.buffer = new Array(size).fill(null)
  }

  private get config(): EventBusConfig {
    return { ...DEFAULT_CONFIG, ...this.deps.config }
  }

  /**
   * Emit an event to the bus
   *
   * This is the ONLY side effect entry point.
   * Returns the created event (immutable).
   */
  public emit<T>(input: EventInput<T>): TracedEvent<T> {
    // Resolve trace context (from explicit, async context, or new)
    const trace = resolveTraceContext({
      traceId: input.traceId,
      parentId: input.parentId,
    })

    // Create the full event
    const event = freezeEvent<T>({
      id: generateEventId(),
      traceId: trace.traceId,
      parentId: trace.parentId,
      type: input.type,
      payload: input.payload,
      timestamp: Date.now(),
      source: input.source,
    })

    // Store in ring buffer
    this.storeEvent(event)

    // Dispatch to subscribers
    this.dispatch(event)

    return event
  }

  /**
   * Emit an event as a child of another event
   * Automatically sets up trace context
   */
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

  /**
   * Subscribe to events matching a pattern
   * Returns an unsubscribe function
   */
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

  /**
   * Get event history as an immutable array
   * Events are returned in chronological order (oldest first)
   */
  public getHistory(): readonly TracedEvent[] {
    const size = this.config.historySize

    if (this.count === 0) {
      return []
    }

    const result: TracedEvent[] = []

    // Calculate start position (oldest event)
    // If buffer is full, oldest is at writeIndex
    // If not full, oldest is at 0
    const startIdx = this.count < size ? 0 : this.writeIndex

    for (let i = 0; i < this.count; i++) {
      const idx = (startIdx + i) % size
      const event = this.buffer[idx]
      if (event) {
        result.push(event)
      }
    }

    return Object.freeze(result)
  }

  /**
   * Get debug snapshot
   */
  public getSnapshot(): EventBusSnapshot {
    return Object.freeze({
      events: this.getHistory(),
      subscriptionCount: this.subscriptions.size,
    })
  }

  /**
   * Replay a sequence of events
   * Used for debugging and testing
   */
  public replay(events: readonly TracedEvent[]): void {
    this.deps.logger.withFields({ count: events.length }).log('EventBus: replaying events')

    for (const event of events) {
      // Store without re-generating IDs
      this.storeEvent(event)
      // Dispatch to current subscribers
      this.dispatch(event)
    }
  }

  /**
   * Clear all events (for testing)
   */
  public clear(): void {
    this.buffer.fill(null)
    this.writeIndex = 0
    this.count = 0
  }

  /**
   * Get events by trace ID
   */
  public getEventsByTrace(traceId: string): readonly TracedEvent[] {
    return Object.freeze(
      this.getHistory().filter(e => e.traceId === traceId),
    )
  }

  // ============================================================
  // Private methods
  // ============================================================

  private storeEvent(event: TracedEvent): void {
    const size = this.config.historySize

    // Write to current position
    this.buffer[this.writeIndex] = event

    // Advance write position
    this.writeIndex = (this.writeIndex + 1) % size

    // Update count (max is buffer size)
    if (this.count < size) {
      this.count++
    }
  }

  private dispatch(event: TracedEvent): void {
    // Create trace context for handlers
    const childContext: TraceContext = deriveTraceContext(event.traceId, event.id)

    for (const sub of this.subscriptions.values()) {
      if (!matchesPattern(sub.pattern, event.type))
        continue

      try {
        // Run handler within trace context so child emissions inherit it
        runWithTraceContext(childContext, () => {
          sub.handler(event)
        })
      }
      catch (err) {
        this.deps.logger
          .withError(err as Error)
          .withFields({ eventType: event.type, pattern: sub.pattern })
          .error('EventBus: handler error')
      }
    }
  }
}

/**
 * Create an EventBus instance
 * Factory function for cleaner API
 */
export function createEventBus(deps: {
  logger: Logg
  config?: Partial<EventBusConfig>
}): EventBus {
  return new EventBus(deps)
}
