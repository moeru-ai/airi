/**
 * Cognitive OS - Event-sourced architecture for the cognitive engine
 *
 * Core principles:
 * - All state changes go through TracedEvents
 * - Events are immutable
 * - Trace context propagates automatically
 * - EventBus is the only mutable container
 */

// NOTE: RuleEngine and rule utilities moved to cognitive/perception/rules.

// EventBus
export { createEventBus, EventBus } from './event-bus'

// Tracer utilities
export {
  createTraceContext,
  deriveTraceContext,
  generateEventId,
  generateTraceId,
  getCurrentTraceContext,
  resolveTraceContext,
  runWithTraceContext,
} from './tracer'

// Core types
export type {
  EventBusConfig,
  EventBusSnapshot,
  EventHandler,
  EventId,
  EventInput,
  EventPattern,
  EventSource,
  Subscription,
  TraceContext,
  TracedEvent,
  TraceId,
  Unsubscribe,
} from './types'

export { freezeEvent } from './types'
