/**
 * AIRI Core — In-Memory Event Bus
 *
 * Concrete implementation of the EventBus interface defined in
 * core/modules/module.ts. Provides typed publish/subscribe with
 * async-safe dispatching and listener isolation.
 *
 * Design decisions:
 * - Listener isolation: each handler is wrapped in try/catch so one
 *   failing listener does not break delivery to others.
 * - Async-safe: publish awaits all handlers sequentially to preserve
 *   ordering guarantees and prevent unhandled promise rejections.
 * - Unsubscribe functions remove the exact handler reference, avoiding
 *   accidental removal of re-registered handlers.
 * - No external dependencies.
 */

import type { AiriEvent } from './types.js'

/**
 * A handler registered on the bus.
 */
type EventHandler = (payload: unknown) => void

/**
 * Internal listener record. Tracks whether the listener should be removed
 * after its next invocation (once semantics).
 */
interface Listener {
  handler: EventHandler
  once: boolean
}

/**
 * Unsubscribe function returned by subscribe/once/publish methods.
 * Call it to remove the handler from the bus.
 */
export type UnsubscribeFn = () => void

/**
 * Concrete in-memory event bus.
 *
 * Supports both the core EventBus interface (on/once/emit) and the
 * typed AiriEvent publish/subscribe API.
 */
export class EventBus {
  /** Map of event name → set of listeners. */
  private readonly listeners = new Map<string, Set<Listener>>()

  // ── Core EventBus interface (on / once / emit) ─────────────────────

  /**
   * Subscribe to an event by name.
   *
   * The handler is invoked synchronously for every emit() call.
   * Returns an unsubscribe function that removes this specific handler.
   */
  on(eventName: string, handler: EventHandler): UnsubscribeFn {
    const set = this.getOrCreateSet(eventName)
    const listener: Listener = { handler, once: false }
    set.add(listener)

    return () => {
      set.delete(listener)
    }
  }

  /**
   * Subscribe to an event for a single emission.
   *
   * The handler is invoked once on the next emit(), then automatically
   * removed. Returns an unsubscribe function for manual removal before firing.
   */
  once(eventName: string, handler: EventHandler): UnsubscribeFn {
    const set = this.getOrCreateSet(eventName)
    const listener: Listener = { handler, once: true }
    set.add(listener)

    return () => {
      set.delete(listener)
    }
  }

  /**
   * Emit an event to all subscribers.
   *
   * Handlers are invoked synchronously in registration order.
   * Each handler is wrapped in try/catch for listener isolation.
   * Once-handlers are removed after invocation.
   */
  emit(eventName: string, payload: unknown): void {
    const set = this.listeners.get(eventName)
    if (!set || set.size === 0)
      return

    // Snapshot to avoid mutation during iteration.
    const snapshot = [...set]

    for (const listener of snapshot) {
      if (listener.once) {
        set.delete(listener)
      }

      try {
        listener.handler(payload)
      }
      catch (error) {
        // Listener isolation: log and continue.
        console.error(
          `[EventBus] Listener for "${eventName}" threw:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  // ── Typed AiriEvent API (publish / subscribe) ─────────────────────

  /**
   * Publish a typed AiriEvent to all subscribers of that event's type.
   *
   * This is a typed wrapper around emit() that uses the event's `type`
   * field as the channel name. Async-safe: awaits each handler.
   */
  async publish(event: AiriEvent): Promise<void> {
    const set = this.listeners.get(event.type)
    if (!set || set.size === 0)
      return

    const snapshot = [...set]

    // Sequential await preserves ordering and prevents unhandled rejections.
    for (const listener of snapshot) {
      if (listener.once) {
        set.delete(listener)
      }

      try {
        await listener.handler(event)
      }
      catch (error) {
        console.error(
          `[EventBus] Async listener for "${event.type}" threw:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  /**
   * Subscribe to a specific AiriEvent type.
   *
   * Returns an unsubscribe function.
   */
  subscribe(type: string, handler: EventHandler): UnsubscribeFn {
    return this.on(type, handler)
  }

  // ── Query / introspection ──────────────────────────────────────────

  /**
   * Return the number of listeners for a given event name.
   * Returns 0 if no listeners are registered.
   */
  listenerCount(eventName: string): number {
    return this.listeners.get(eventName)?.size ?? 0
  }

  /**
   * Remove all listeners for a given event name, or all events if no name is given.
   */
  clear(eventName?: string): void {
    if (eventName) {
      this.listeners.delete(eventName)
    }
    else {
      this.listeners.clear()
    }
  }

  // ── Private ────────────────────────────────────────────────────────

  private getOrCreateSet(eventName: string): Set<Listener> {
    let set = this.listeners.get(eventName)
    if (!set) {
      set = new Set()
      this.listeners.set(eventName, set)
    }
    return set
  }
}
