/**
 * AIRI Core — Tool Runtime Interface
 *
 * Transport/execution-agnostic contract for tool execution. This interface
 * abstracts over how tools are invoked — whether locally in-process, in a
 * worker process, or remotely via RPC.
 *
 * Design decisions:
 * - Interface is small: execute, hasTool, getToolDescriptor.
 * - Input/output are `unknown` — serialization and validation are the
 *   responsibility of the implementation.
 * - Context carries cancellation and timeout — implementations must honor both.
 */

import type { ToolId, ToolDescriptor, ToolExecutionContext, ToolExecutionResult } from "../capabilities/types.js"

/**
 * Transport/execution-agnostic tool runtime interface.
 *
 * Implementations dispatch tool invocations and return structured results.
 */
export interface ToolRuntime {
	/**
	 * Execute a tool with the given input and context.
	 *
	 * @param toolId - The tool to execute.
	 * @param input - Tool-specific input parameters.
	 * @param context - Execution context with task ID, cancellation, and timeout.
	 * @returns The structured tool execution result.
	 */
	execute(
		toolId: ToolId,
		input: unknown,
		context: ToolExecutionContext,
	): Promise<ToolExecutionResult>

	/**
	 * Check whether a tool is available for execution.
	 *
	 * @param toolId - The tool identifier.
	 * @returns true if the tool is registered and can be executed.
	 */
	hasTool(toolId: ToolId): boolean

	/**
	 * Get the descriptor for a tool.
	 *
	 * @param toolId - The tool identifier.
	 * @returns The tool descriptor, or undefined if not found.
	 */
	getToolDescriptor(toolId: ToolId): ToolDescriptor | undefined
}
