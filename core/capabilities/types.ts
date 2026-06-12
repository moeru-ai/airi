/**
 * AIRI Core — Capability & Tool Type Definitions
 *
 * Branded types and descriptors for the capability + tool runtime layer.
 * These types define the metadata and execution contracts for capabilities
 * (groupings of tools) and individual tools that can be invoked by the
 * planner or other orchestration layers.
 *
 * Design principles:
 * - Branded types for ID safety (CapabilityId, ToolId cannot be confused with raw strings).
 * - Descriptors are plain objects for serialization across process boundaries.
 * - Tool execution context carries task ID, cancellation, and timeout.
 * - Structured error wrapping for all tool execution results.
 */

import type { TaskId } from "../tasks/types.js"
import type { CancellationToken } from "../tasks/cancellation.js"

// ── Branded IDs ──────────────────────────────────────────────────────────

/**
 * Opaque capability identifier.
 *
 * Created via createCapabilityId() to ensure brand safety at creation sites.
 */
export type CapabilityId = string & { readonly __brand: 'CapabilityId' }

/**
 * Opaque tool identifier.
 *
 * Created via createToolId() to ensure brand safety at creation sites.
 */
export type ToolId = string & { readonly __brand: 'ToolId' }

/**
 * Create a branded CapabilityId from a raw string.
 *
 * @example
 * ```ts
 * const id = createCapabilityId("code")
 * ```
 */
export function createCapabilityId(raw: string): CapabilityId {
	return raw as CapabilityId
}

/**
 * Create a branded ToolId from a raw string.
 *
 * @example
 * ```ts
 * const id = createToolId("read_file")
 * ```
 */
export function createToolId(raw: string): ToolId {
	return raw as ToolId
}

// ── Tool descriptor ─────────────────────────────────────────────────────

/**
 * Describes a single tool within a capability.
 *
 * Tools are the invocable units of work. Each tool belongs to exactly one
 * capability and has a unique ToolId across the entire system.
 */
export interface ToolDescriptor {
	/** Unique tool identifier (e.g. "read_file", "apply_diff"). */
	readonly id: ToolId

	/** Human-readable name (e.g. "Read File"). */
	readonly name: string

	/** Description of what this tool does. */
	readonly description: string

	/** The capability this tool belongs to. */
	readonly capabilityId: CapabilityId

	/**
	 * JSON Schema or similar descriptor for tool input validation.
	 * `unknown` keeps this agnostic to the schema format.
	 */
	readonly inputSchema: unknown

	/**
	 * JSON Schema or similar descriptor for tool output.
	 * `unknown` keeps this agnostic to the schema format.
	 */
	readonly outputSchema: unknown
}

// ── Capability descriptor ───────────────────────────────────────────────

/**
 * Describes a capability — a logical grouping of tools.
 *
 * Capabilities are registered by modules. Each capability has a unique
 * CapabilityId and contains one or more tools.
 */
export interface CapabilityDescriptor {
	/** Unique capability identifier (e.g. "code", "terminal", "filesystem"). */
	readonly id: CapabilityId

	/** Human-readable name (e.g. "Code Tools"). */
	readonly name: string

	/** Description of what this capability provides. */
	readonly description: string

	/** The module that owns this capability. */
	readonly moduleId: string

	/** Tools provided by this capability. */
	readonly tools: ToolDescriptor[]
}

// ── Tool execution context ──────────────────────────────────────────────

/**
 * Context provided to a tool during execution.
 *
 * Carries task association, cancellation, timeout, and metadata.
 */
export interface ToolExecutionContext {
	/** The task this tool execution is associated with. */
	readonly taskId: TaskId

	/** Optional workspace identifier for scoping filesystem operations. */
	readonly workspaceId?: string

	/** Cancellation token for cooperative cancellation. */
	readonly cancellationToken: CancellationToken

	/** Maximum execution time in milliseconds. */
	readonly timeoutMs: number

	/** Additional metadata for the tool execution. */
	readonly metadata: Record<string, unknown>
}

// ── Tool execution result ───────────────────────────────────────────────

/**
 * Structured result of a tool execution.
 */
export interface ToolExecutionResult {
	/** Whether the tool executed successfully. */
	readonly success: boolean

	/** Tool output data (tool-specific). */
	readonly output: unknown

	/** Execution duration in milliseconds. */
	readonly durationMs: number

	/** Error details when success is false. */
	readonly error?: {
		/** Machine-readable error code (e.g. "TIMEOUT", "CANCELLED", "EXECUTION_ERROR"). */
		readonly code: string

		/** Human-readable error description. */
		readonly message: string

		/** Optional structured error details. */
		readonly details?: unknown
	}
}

// ── Capability status ──────────────────────────────────────────────────

/**
 * Lifecycle states for a registered capability.
 */
export type CapabilityStatus =
	| "registered"
	| "active"
	| "failed"
	| "deregistered"

/**
 * Full information about a registered capability, including its current
 * lifecycle state and timestamps.
 */
export interface CapabilityInfo {
	/** The capability descriptor. */
	readonly descriptor: CapabilityDescriptor

	/** Current lifecycle status. */
	readonly status: CapabilityStatus

	/** Unix timestamp (ms) of when the capability was registered. */
	readonly registeredAt: number

	/** Unix timestamp (ms) of last activation, if any. */
	readonly lastActivatedAt?: number

	/** Error message if the capability is in a failed state. */
	readonly error?: string
}
