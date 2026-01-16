import type { EventId, TraceContext, TraceId } from './types'

/**
 * AsyncLocalStorage-based trace context propagation
 * This allows handlers to automatically inherit trace context
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { nanoid } from 'nanoid'

/**
 * Generate a unique event ID
 * Uses nanoid for compact, URL-safe IDs
 */
export function generateEventId(): EventId {
  return nanoid(12)
}

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): TraceId {
  return nanoid(16)
}

/**
 * Create a new trace context for a fresh event chain
 */
export function createTraceContext(): TraceContext {
  return Object.freeze({
    traceId: generateTraceId(),
  })
}

/**
 * Derive a child trace context from a parent event
 * Preserves the same traceId but sets the parentId
 */
export function deriveTraceContext(
  parentTraceId: TraceId,
  parentEventId: EventId,
): TraceContext {
  return Object.freeze({
    traceId: parentTraceId,
    parentId: parentEventId,
  })
}

const traceStorage = new AsyncLocalStorage<TraceContext>()

/**
 * Get the current trace context from async local storage
 * Returns undefined if not in a traced context
 */
export function getCurrentTraceContext(): TraceContext | undefined {
  return traceStorage.getStore()
}

/**
 * Run a function within a trace context
 * All events emitted within this context will inherit the trace
 */
export function runWithTraceContext<T>(
  context: TraceContext,
  fn: () => T,
): T {
  return traceStorage.run(context, fn)
}

/**
 * Create or derive trace context for an event
 * If we're in a traced context, derive from it; otherwise create new
 */
export function resolveTraceContext(
  explicit?: Partial<TraceContext>,
): TraceContext {
  const current = getCurrentTraceContext()

  if (explicit?.traceId) {
    // Explicit context provided
    return Object.freeze({
      traceId: explicit.traceId,
      parentId: explicit.parentId,
    })
  }

  if (current) {
    // Derive from current async context
    // Note: parentId should be set by the caller who knows the parent event
    return Object.freeze({
      traceId: current.traceId,
      parentId: current.parentId,
    })
  }

  // New trace
  return createTraceContext()
}
