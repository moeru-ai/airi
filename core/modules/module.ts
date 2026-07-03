/**
 * AIRI Module System — Core Contracts
 *
 * This file defines the minimal interfaces that every AIRI module must implement.
 * Keep intentionally lightweight: just enough to type the contract, not full
 * implementations. Concrete implementations (event buses, runtimes, etc.) live
 * in their own modules and are injected via CoreContext.
 */

import type {
  CapabilityDescriptor,
  CapabilityId,
  CapabilityInfo,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolId,
} from '../capabilities/types.js'

/**
 * Transport-agnostic runtime client.
 *
 * Implementations may wrap WebSocket, gRPC, stdio, in-process messaging, etc.
 * The interface stays minimal so that modules never depend on a specific transport.
 */
export interface RuntimeClient {
  /** Establish the underlying transport connection. */
  connect: () => Promise<void>

  /** Gracefully tear down the connection. */
  disconnect: () => Promise<void>

  /**
   * Send a message through the runtime channel.
   *
   * @param channel - Logical channel / topic name.
   * @param payload - Opaque payload (serialization is the implementer's concern).
   */
  send: (channel: string, payload: unknown) => Promise<void>

  /**
   * Subscribe to messages on a logical channel.
   *
   * @param channel - Logical channel / topic name.
   * @param handler - Callback invoked for each inbound message.
   * @returns A unsubscribe function.
   */
  subscribe: (channel: string, handler: (payload: unknown) => void) => () => void
}

/**
 * Minimal event bus contract.
 *
 * The event bus is the primary inter-module communication mechanism.
 * Modules publish events; interested modules subscribe. The bus is
 * intentionally untyped at this level — each event type is defined in
 * core/events/types.ts and consumed via typed helpers.
 */
export interface EventBus {
  /**
   * Emit an event to all subscribers.
   *
   * @param eventName - Unique event identifier.
   * @param payload - Event data.
   */
  emit: (eventName: string, payload: unknown) => void

  /**
   * Subscribe to an event.
   *
   * @param eventName - Event identifier to listen for.
   * @param handler - Callback invoked when the event fires.
   * @returns A unsubscribe function.
   */
  on: (eventName: string, handler: (payload: unknown) => void) => () => void

  /**
   * Subscribe to an event for a single emission.
   *
   * @param eventName - Event identifier to listen for.
   * @param handler - Callback invoked once, then removed.
   * @returns A unsubscribe function.
   */
  once: (eventName: string, handler: (payload: unknown) => void) => () => void
}

/**
 * Capability registry contract (structural).
 *
 * Concrete implementation: core/capabilities/registry.ts. Kept as a
 * structural interface here so modules depend on the contract, not the
 * class, avoiding a hard import of the concrete registry.
 */
export interface CapabilityRegistry {
  register: (descriptor: CapabilityDescriptor) => void
  unregister: (capabilityId: CapabilityId) => boolean
  get: (capabilityId: CapabilityId) => CapabilityInfo | undefined
  list: () => CapabilityInfo[]
  findByModule: (moduleId: string) => CapabilityInfo[]
  findTool: (toolId: ToolId) => { capability: CapabilityInfo, tool: ToolDescriptor } | undefined
  hasTool: (toolId: ToolId) => boolean
  clear: () => number
  size: () => number
}

/**
 * Tool runtime contract (structural).
 *
 * Concrete interface: core/runtime/tool-runtime.ts. Stored here as a
 * structural type so module activations depend on the contract.
 */
export interface ToolRuntime {
  execute: (toolId: ToolId, input: unknown, context: ToolExecutionContext) => Promise<ToolExecutionResult>
  hasTool: (toolId: ToolId) => boolean
  getToolDescriptor: (toolId: ToolId) => ToolDescriptor | undefined
}

/**
 * Context injected into every module during activation.
 *
 * This is the sole structural dependency for modules — they receive
 * what they need rather than reaching out to global singletons.
 */
export interface CoreContext {
  /** The module's declared identifier (matches AiriModule.id). */
  readonly moduleId: string

  /** Event bus for inter-module communication. */
  readonly events: EventBus

  /** Runtime client for external communication. */
  readonly runtime: RuntimeClient

  /** Capability registry for registering and discovering capabilities/tools. */
  readonly capabilities: CapabilityRegistry

  /** Tool runtime for executing registered tools. */
  readonly toolRuntime: ToolRuntime

  /**
   * Structured logger.
   * Implementations decide on output format, levels, and sinks.
   */
  readonly logger: {
    info: (message: string, ...args: unknown[]) => void
    warn: (message: string, ...args: unknown[]) => void
    error: (message: string, ...args: unknown[]) => void
    debug: (message: string, ...args: unknown[]) => void
  }
}

/**
 * AIRI Module — the unit of extensibility.
 *
 * Every capability in the AIRI platform is packaged as a module:
 * the code/ editing module, the terminal module, the git module, etc.
 * Modules are registered with a registry and activated with a CoreContext.
 *
 * Lifecycle:
 * 1. Module is constructed (synchronous).
 * 2. `activate(ctx)` is called — the module registers event handlers,
 *    starts background work, and returns when ready.
 * 3. On shutdown, `deactivate()` (if defined) is called for cleanup.
 */
export interface AiriModule {
  /** Unique, stable identifier (e.g. "code", "terminal", "git"). */
  readonly id: string

  /** Human-readable display name. */
  readonly name: string

  /**
   * Called when the module is being activated.
   *
   * Implementations should:
   * - Register event handlers via ctx.events
   * - Start any background processes
   * - Throw if activation fails (the registry will log and continue)
   *
   * @param ctx - The core context for this module.
   */
  activate: (ctx: CoreContext) => Promise<void>

  /**
   * Called when the module is being deactivated (shutdown or hot-reload).
   *
   * Implementations should:
   * - Unregister event handlers
   * - Stop background processes
   * - Release resources
   */
  deactivate?: () => Promise<void>
}
