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
 */

import type { EventBus } from "../events/bus.js"
import type { CancellationToken } from "../tasks/cancellation.js"
import { withTimeout } from "../tasks/cancellation.js"
import type {
	ToolId,
	ToolDescriptor,
	ToolExecutionContext,
	ToolExecutionResult,
} from "../capabilities/types.js"
import type { ToolRuntime } from "./tool-runtime.js"
import type { CapabilityRegistry } from "../capabilities/registry.js"

/**
 * Tool handler function type.
 *
 * Receives the tool input and execution context, returns the tool output.
 */
export type ToolHandler = (
	input: unknown,
	ctx: ToolExecutionContext,
) => Promise<unknown>

/**
 * In-process tool runtime implementation.
 *
 * Dispatches tool invocations through a CapabilityRegistry and emits
 * lifecycle events via an EventBus.
 */
export class LocalToolRuntime implements ToolRuntime {
	private readonly registry: CapabilityRegistry
	private readonly events: EventBus

	/**
	 * Registered tool handlers, keyed by ToolId.
	 */
	private readonly handlers = new Map<ToolId, ToolHandler>()

	/**
	 * Create a new LocalToolRuntime.
	 *
	 * @param registry - The capability registry to look up tools from.
	 * @param events - The event bus for emitting tool lifecycle events.
	 */
	constructor(registry: CapabilityRegistry, events: EventBus) {
		this.registry = registry
		this.events = events
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

	async execute(
		toolId: ToolId,
		input: unknown,
		context: ToolExecutionContext,
	): Promise<ToolExecutionResult> {
		const startedAt = Date.now()
		const executionId = crypto.randomUUID()

		// Emit tool.execution.started.
		this.events.emit("tool.execution.started", {
			timestamp: new Date().toISOString(),
			source: "tool-runtime",
			executionId,
			toolId: toolId as string,
			taskId: context.taskId as string,
		})

		// Check cancellation before starting.
		if (context.cancellationToken.isCancelled) {
			const durationMs = Date.now() - startedAt
			this.events.emit("tool.execution.failed", {
				timestamp: new Date().toISOString(),
				source: "tool-runtime",
				executionId,
				toolId: toolId as string,
				taskId: context.taskId as string,
				error: { code: "CANCELLED", message: "Task cancelled before execution" },
			})
			return {
				success: false,
				output: null,
				durationMs,
				error: { code: "CANCELLED", message: "Task cancelled before execution" },
			}
		}

		// Look up the tool in the registry.
		const found = this.registry.findTool(toolId)
		if (!found) {
			const durationMs = Date.now() - startedAt
			this.events.emit("tool.execution.failed", {
				timestamp: new Date().toISOString(),
				source: "tool-runtime",
				executionId,
				toolId: toolId as string,
				taskId: context.taskId as string,
				error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolId}` },
			})
			return {
				success: false,
				output: null,
				durationMs,
				error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolId}` },
			}
		}

		// Look up the handler.
		const handler = this.handlers.get(toolId)
		if (!handler) {
			const durationMs = Date.now() - startedAt
			this.events.emit("tool.execution.failed", {
				timestamp: new Date().toISOString(),
				source: "tool-runtime",
				executionId,
				toolId: toolId as string,
				taskId: context.taskId as string,
				error: { code: "NO_HANDLER", message: `No handler registered for tool: ${toolId}` },
			})
			return {
				success: false,
				output: null,
				durationMs,
				error: { code: "NO_HANDLER", message: `No handler registered for tool: ${toolId}` },
			}
		}

		// Execute with timeout and cancellation.
		try {
			const output = await withTimeout(
				handler(input, context),
				context.timeoutMs,
				context.cancellationToken,
			)

			const durationMs = Date.now() - startedAt

			// Emit tool.execution.completed.
			this.events.emit("tool.execution.completed", {
				timestamp: new Date().toISOString(),
				source: "tool-runtime",
				executionId,
				toolId: toolId as string,
				taskId: context.taskId as string,
				durationMs,
				success: true,
			})

			return { success: true, output, durationMs }
		} catch (error) {
			const durationMs = Date.now() - startedAt
			const message = error instanceof Error ? error.message : String(error)

			// Determine error code.
			let code = "EXECUTION_ERROR"
			if (message.includes("cancelled") || message.includes("Cancelled")) {
				code = "CANCELLED"
			} else if (message.includes("timed out")) {
				code = "TIMEOUT"
			}

			// Emit tool.execution.failed.
			this.events.emit("tool.execution.failed", {
				timestamp: new Date().toISOString(),
				source: "tool-runtime",
				executionId,
				toolId: toolId as string,
				taskId: context.taskId as string,
				error: { code, message },
			})

			return {
				success: false,
				output: null,
				durationMs,
				error: { code, message },
			}
		}
	}

	hasTool(toolId: ToolId): boolean {
		return this.registry.hasTool(toolId) && this.handlers.has(toolId)
	}

	getToolDescriptor(toolId: ToolId): ToolDescriptor | undefined {
		const found = this.registry.findTool(toolId)
		return found?.tool
	}
}
