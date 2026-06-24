/**
 * AIRI Core — Local Tool Runtime
 *
 * In-process implementation of the ToolRuntime interface. Dispatches tool
 * invocations through a CapabilityRegistry and emits lifecycle events via
 * an EventBus.
 *
 * Design decisions:
 * - Handler functions are registered separately from descriptors, allowing
 *   the same descriptor to have different handler implementations in different
 *   contexts (e.g. test vs. production).
 * - Timeout is enforced via withTimeout from the cancellation module.
 * - Cancellation is checked before and during execution.
 * - All errors are wrapped in structured ToolExecutionResult — this class
 *   does not throw.
 * - Optional EventStore persistence for tool execution events.
 * - Optional WorkspaceManager for workspace-scoped tool execution.
 */

import type { EventBus } from '../events/bus.js'
import { withTimeout } from '../tasks/cancellation.js'
import type { ToolId, ToolDescriptor, ToolExecutionContext, ToolExecutionResult } from '../capabilities/types.js'
import type { ToolRuntime } from './tool-runtime.js'
import type { CapabilityRegistry } from '../capabilities/registry.js'
import type { EventStore } from '../persistence/types.js'
import type { WorkspaceManager } from '../workspace/manager.js'

/**
 * Tool handler function type.
 *
 * Receives the tool input and execution context, returns the tool output.
 */
export type ToolHandler = (input: unknown, ctx: ToolExecutionContext) => Promise<unknown>

/**
 * In-process tool runtime implementation.
 *
 * Dispatches tool invocations through a CapabilityRegistry and emits
 * lifecycle events via an EventBus. Optionally persists tool execution
 * events to an EventStore. Optionally validates workspace leases before
 * executing workspace-scoped tools.
 */
export class LocalToolRuntime implements ToolRuntime {
  private readonly registry: CapabilityRegistry
  private readonly events: EventBus

  /**
   * Optional event store for persisting tool execution events.
   */
  private readonly eventStore: EventStore | undefined

  /**
   * Optional workspace manager for workspace-scoped execution.
   */
  private readonly workspaceManager: WorkspaceManager | undefined

  /**
   * Registered tool handlers, keyed by ToolId.
   */
  private readonly handlers = new Map<ToolId, ToolHandler>()

  /**
   * Create a new LocalToolRuntime.
   *
   * @param registry - The capability registry to look up tools from.
   * @param events - The event bus for emitting tool lifecycle events.
   * @param eventStore - Optional event store for persisting tool execution events.
   * @param workspaceManager - Optional workspace manager for workspace-scoped execution.
   */
  constructor(
    registry: CapabilityRegistry,
    events: EventBus,
    eventStore?: EventStore,
    workspaceManager?: WorkspaceManager,
  ) {
    this.registry = registry
    this.events = events
    this.eventStore = eventStore
    this.workspaceManager = workspaceManager
  }

  /**
   * Register a handler for a tool.
   *
   * The tool must already be registered in the CapabilityRegistry.
   *
   * @param toolId - The tool to register a handler for.
   * @param handler - The handler function.
   * @throws Error if the tool is not registered in the registry.
   */
  registerHandler(toolId: ToolId, handler: ToolHandler): void {
    if (!this.registry.hasTool(toolId)) {
      throw new Error(`Cannot register handler for unknown tool: ${toolId}`)
    }
    this.handlers.set(toolId, handler)
  }

  /**
   * Unregister a handler for a tool.
   *
   * @param toolId - The tool to unregister the handler for.
   * @returns true if a handler was removed, false if none was registered.
   */
  unregisterHandler(toolId: ToolId): boolean {
    return this.handlers.delete(toolId)
  }

  // ── ToolRuntime interface ────────────────────────────────────────────

  // async: implements interface (Promise<ToolExecutionResult>)
  async execute(toolId: ToolId, input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startedAt = Date.now()
    const executionId = crypto.randomUUID()

    this.emitStarted(executionId, toolId, context)
    this.persistStarted(executionId, toolId, context)

    if (context.cancellationToken.isCancelled) {
      return this.buildCancelledResult(toolId, context, executionId, startedAt)
    }

    if (this.workspaceManager && context.workspaceContext) {
      const leaseError = this.validateWorkspaceLease(toolId, context, executionId, startedAt)
      if (leaseError) return leaseError
    }

    const found = this.registry.findTool(toolId)
    if (!found) {
      return this.buildErrorResult(toolId, context, executionId, startedAt, 'UNKNOWN_TOOL', `Unknown tool: ${toolId}`)
    }

    const handler = this.handlers.get(toolId)
    if (!handler) {
      return this.buildErrorResult(toolId, context, executionId, startedAt, 'NO_HANDLER', `No handler registered for tool: ${toolId}`)
    }

    try {
      const output = await withTimeout(handler(input, context), context.timeoutMs, context.cancellationToken)
      const durationMs = Date.now() - startedAt
      this.emitSuccess(executionId, toolId, context, durationMs)
      this.persistSuccess(executionId, toolId, context, durationMs)
      return { success: true, output, durationMs }
    } catch (error) {
      return this.handleExecutionError(toolId, context, executionId, startedAt, error)
    }
  }

  private emitStarted(executionId: string, toolId: ToolId, context: ToolExecutionContext): void {
    this.events.emit('tool.execution.started', {
      timestamp: new Date().toISOString(),
      source: 'tool-runtime',
      executionId,
      toolId,
      taskId: context.taskId as string,
    })
  }

  private persistStarted(executionId: string, toolId: ToolId, context: ToolExecutionContext): void {
    if (!this.eventStore) return
    this.eventStore
      .append({
        type: 'tool.execution.started',
        timestamp: new Date().toISOString(),
        source: 'tool-runtime',
        executionId,
        toolId,
        taskId: context.taskId as string,
      })
      .catch(() => {})
  }

  private buildCancelledResult(
    toolId: ToolId,
    context: ToolExecutionContext,
    executionId: string,
    startedAt: number,
  ): ToolExecutionResult {
    const durationMs = Date.now() - startedAt
    const error = { code: 'CANCELLED', message: 'Task cancelled before execution' }
    this.emitFailed(executionId, toolId, context, error)
    return { success: false, output: null, durationMs, error }
  }

  private validateWorkspaceLease(
    toolId: ToolId,
    context: ToolExecutionContext,
    executionId: string,
    startedAt: number,
  ): ToolExecutionResult | null {
    const valid = this.workspaceManager!.validateLease(
      context.workspaceContext!.workspaceId,
      context.workspaceContext!.leaseToken ?? '',
    )
    if (valid) return null
    return this.buildErrorResult(toolId, context, executionId, startedAt, 'LEASE_INVALID', 'Workspace lease is invalid or expired')
  }

  private buildErrorResult(
    toolId: ToolId,
    context: ToolExecutionContext,
    executionId: string,
    startedAt: number,
    code: string,
    message: string,
  ): ToolExecutionResult {
    const durationMs = Date.now() - startedAt
    this.emitFailed(executionId, toolId, context, { code, message })
    return { success: false, output: null, durationMs, error: { code, message } }
  }

  private emitFailed(
    executionId: string,
    toolId: ToolId,
    context: ToolExecutionContext,
    error: { code: string; message: string },
  ): void {
    this.events.emit('tool.execution.failed', {
      timestamp: new Date().toISOString(),
      source: 'tool-runtime',
      executionId,
      toolId: toolId as string,
      taskId: context.taskId as string,
      error,
    })
  }

  private emitSuccess(executionId: string, toolId: ToolId, context: ToolExecutionContext, durationMs: number): void {
    this.events.emit('tool.execution.completed', {
      timestamp: new Date().toISOString(),
      source: 'tool-runtime',
      executionId,
      toolId: toolId as string,
      taskId: context.taskId as string,
      durationMs,
      success: true,
    })
  }

  private persistSuccess(executionId: string, toolId: ToolId, context: ToolExecutionContext, durationMs: number): void {
    if (!this.eventStore) return
    this.eventStore
      .append({
        type: 'tool.execution.completed',
        timestamp: new Date().toISOString(),
        source: 'tool-runtime',
        executionId,
        toolId,
        taskId: context.taskId as string,
        durationMs,
        success: true,
      })
      .catch(() => {})
  }

  private handleExecutionError(
    toolId: ToolId,
    context: ToolExecutionContext,
    executionId: string,
    startedAt: number,
    error: unknown,
  ): ToolExecutionResult {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    const code = this.classifyErrorMessage(message)
    this.emitFailed(executionId, toolId, context, { code, message })
    this.persistFailure(executionId, toolId, context, code, message)
    return { success: false, output: null, durationMs, error: { code, message } }
  }

  private classifyErrorMessage(message: string): string {
    if (this.isCancelledMessage(message)) return 'CANCELLED'
    if (this.isTimeoutMessage(message)) return 'TIMEOUT'
    return 'EXECUTION_ERROR'
  }

  private isCancelledMessage(message: string): boolean {
    return message.includes('cancelled') || message.includes('Cancelled')
  }

  private isTimeoutMessage(message: string): boolean {
    return message.includes('timed out')
  }

  private persistFailure(
    executionId: string,
    toolId: ToolId,
    context: ToolExecutionContext,
    code: string,
    message: string,
  ): void {
    if (!this.eventStore) return
    this.eventStore
      .append({
        type: 'tool.execution.failed',
        timestamp: new Date().toISOString(),
        source: 'tool-runtime',
        executionId,
        toolId,
        taskId: context.taskId as string,
        error: { code, message },
      })
      .catch(() => {})
  }

  hasTool(toolId: ToolId): boolean {
    return this.registry.hasTool(toolId) && this.handlers.has(toolId)
  }

  getToolDescriptor(toolId: ToolId): ToolDescriptor | undefined {
    const found = this.registry.findTool(toolId)
    return found?.tool
  }
}
