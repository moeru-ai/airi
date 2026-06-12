/**
 * AIRI Core Event Types
 *
 * Minimal, platform-agnostic event definitions for inter-module communication.
 *
 * Design principles:
 * - Every event carries a timestamp and a source identifier so that
 *   consumers can reason about ordering and origin without coupling to
 *   a specific module's internals.
 * - Events avoid hardcoding coding-specific semantics. "Task" here means
 *   a unit of work in the AIRI platform, not specifically a coding task.
 * - Payloads are plain objects with required + optional fields, keeping
 *   them serializable by default.
 */

import type { TaskError } from "../tasks/types.js"
import type { CapabilityId, ToolId } from "../capabilities/types.js"

// ── Base envelope ─────────────────────────────────────────────────────

/**
 * Base fields present on every AIRI event.
 *
 * New fields should be added here only if they are truly universal.
 * Module-specific data belongs in the payload, not the envelope.
 */
export interface AiriEventBase {
	/** ISO-8601 timestamp of when the event was emitted. */
	readonly timestamp: string

	/**
	 * Identifier of the module or subsystem that emitted this event.
	 * Uses the module's declared id (e.g. "code", "terminal").
	 */
	readonly source: string
}

// ── Task lifecycle events ────────────────────────────────────────────

/**
 * Emitted when a new task (unit of work) is created.
 */
export interface TaskStarted extends AiriEventBase {
	readonly type: "task.started"

	/** Opaque task identifier assigned by the creating module. */
	readonly taskId: string

	/** Optional human-readable label for the task. */
	readonly label?: string
}

/**
 * Emitted when a task completes successfully.
 */
export interface TaskCompleted extends AiriEventBase {
	readonly type: "task.completed"

	readonly taskId: string

	/** Optional summary or result metadata. */
	readonly summary?: string
}

// ── Tool execution events ─────────────────────────────────────────────

/**
 * Emitted when a tool is about to be invoked.
 */
export interface ToolCalled extends AiriEventBase {
	readonly type: "tool.called"

	/** Opaque identifier for this specific tool invocation. */
	readonly callId: string

	/** Name of the tool being called (e.g. "read_file", "bash"). */
	readonly toolName: string

	/** Task this tool call is associated with, if any. */
	readonly taskId?: string

	/** Opaque input parameters (tool-specific). */
	readonly input?: unknown
}

/**
 * Emitted when a tool invocation finishes (success or failure).
 */
export interface ToolFinished extends AiriEventBase {
	readonly type: "tool.finished"

	/** Matches the callId from the corresponding ToolCalled event. */
	readonly callId: string

	readonly toolName: string

	/** Whether the tool execution succeeded. */
	readonly success: boolean

	/** Error message when success is false. */
	readonly error?: string

	/** Opaque output (tool-specific). */
	readonly output?: unknown
}

// ── Module lifecycle events ───────────────────────────────────────────

/**
 * Emitted when a module has been successfully activated.
 */
export interface ModuleActivated extends AiriEventBase {
	readonly type: "module.activated"

	/** The module's declared id. */
	readonly moduleId: string

	/** The module's human-readable name. */
	readonly moduleName: string
}

/**
 * Emitted when a module encounters an unrecoverable error during activation
 * or runtime.
 */
export interface ModuleCrashed extends AiriEventBase {
	readonly type: "module.crashed"

	readonly moduleId: string

	readonly moduleName: string

	/** Human-readable error message. */
	readonly error: string

	/** Whether the system attempted to recover from this crash. */
	readonly recovered: boolean
}

// ── Extended task orchestration events ──────────────────────────────────

/**
 * Emitted when a task is queued for execution.
 */
export interface TaskQueued extends AiriEventBase {
	readonly type: "task.queued"

	/** The task's unique identifier. */
	readonly taskId: string

	/** The module that owns this task. */
	readonly moduleId: string

	/** Task priority. */
	readonly priority: string

	/** Optional human-readable label. */
	readonly label?: string
}

/**
 * Emitted when a task reports progress.
 */
export interface TaskProgress extends AiriEventBase {
	readonly type: "task.progress"

	readonly taskId: string

	/** Progress percentage (0-100). */
	readonly progress: number

	/** Optional progress message. */
	readonly message?: string
}

/**
 * Emitted when a task fails.
 */
export interface TaskFailed extends AiriEventBase {
	readonly type: "task.failed"

	readonly taskId: string

	/** Structured error information. */
	readonly error: TaskError
}

/**
 * Emitted when a task is cancelled.
 */
export interface TaskCancelled extends AiriEventBase {
	readonly type: "task.cancelled"

	readonly taskId: string

	/** Optional cancellation reason. */
	readonly reason?: string
}

// ── Workspace events ──────────────────────────────────────────────────

/**
 * Emitted when a workspace session is created for a task.
 */
export interface WorkspaceCreated extends AiriEventBase {
	readonly type: "workspace.created"

	/** The workspace session identifier. */
	readonly sessionId: string

	/** Absolute path to the workspace root. */
	readonly rootPath: string

	/** The task this workspace is associated with. */
	readonly taskId: string
}

// ── Tool execution lifecycle events ───────────────────────────────────

/**
 * Emitted when a tool execution starts within a task.
 */
export interface ToolExecutionStarted extends AiriEventBase {
	readonly type: "tool.execution.started"

	/** The task being executed. */
	readonly taskId: string

	/** The tool being executed. */
	readonly toolName: string
}

/**
 * Emitted when a tool execution completes within a task.
 */
export interface ToolExecutionCompleted extends AiriEventBase {
	readonly type: "tool.execution.completed"

	/** The task being executed. */
	readonly taskId: string

	/** The tool that was executed. */
	readonly toolName: string

	/** Whether the tool execution succeeded. */
	readonly success: boolean

	/** Execution duration in milliseconds. */
	readonly durationMs: number
}

// ── Patch events ──────────────────────────────────────────────────────

/**
 * Emitted when a patch is generated for a task.
 */
export interface PatchGenerated extends AiriEventBase {
	readonly type: "patch.generated"

	/** The task this patch is associated with. */
	readonly taskId: string

	/** Unique identifier for the patch proposal. */
	readonly patchId: string

	/** Number of files changed in the patch. */
	readonly fileCount: number
}

/**
 * Emitted when a patch is approved.
 */
export interface PatchApproved extends AiriEventBase {
	readonly type: "patch.approved"

	/** The task this patch is associated with. */
	readonly taskId: string

	/** Unique identifier for the approved patch proposal. */
	readonly patchId: string
}

/**
 * Emitted when a patch is rejected.
 */
export interface PatchRejected extends AiriEventBase {
	readonly type: "patch.rejected"

	/** The task this patch is associated with. */
	readonly taskId: string

	/** Unique identifier for the rejected patch proposal. */
	readonly patchId: string

	/** Optional rejection reason. */
	readonly reason?: string
}

// ── Plan orchestration events ─────────────────────────────────────────

/**
 * Emitted when a plan begins execution.
 */
export interface PlanStarted extends AiriEventBase {
	readonly type: "plan.started"

	/** The plan's unique identifier. */
	readonly planId: string

	/** Human-readable plan name. */
	readonly name: string

	/** Total number of steps in the plan. */
	readonly stepCount: number
}

/**
 * Emitted when a plan completes successfully.
 */
export interface PlanCompleted extends AiriEventBase {
	readonly type: "plan.completed"

	readonly planId: string

	readonly name: string

	/** Total execution duration in milliseconds. */
	readonly durationMs: number
}

/**
 * Emitted when a plan fails.
 */
export interface PlanFailed extends AiriEventBase {
	readonly type: "plan.failed"

	readonly planId: string

	readonly name: string

	/** Human-readable failure reason. */
	readonly failureReason?: string

	/** The step that caused the plan to fail, if any. */
	readonly failedStepId?: string
}

/**
 * Emitted when a plan is cancelled.
 */
export interface PlanCancelled extends AiriEventBase {
	readonly type: "plan.cancelled"

	readonly planId: string

	readonly name: string

	/** Optional cancellation reason. */
	readonly reason?: string
}

/**
 * Emitted when a step begins execution.
 */
export interface StepStarted extends AiriEventBase {
	readonly type: "step.started"

	readonly planId: string

	readonly stepId: string

	/** Human-readable step name. */
	readonly stepName: string

	/** The action this step performs. */
	readonly action: string
}

/**
 * Emitted when a step completes successfully.
 */
export interface StepCompleted extends AiriEventBase {
	readonly type: "step.completed"

	readonly planId: string

	readonly stepId: string

	readonly stepName: string

	/** Whether the step execution succeeded. */
	readonly success: boolean

	/** Step execution duration in milliseconds. */
	readonly durationMs: number
}

/**
 * Emitted when a step fails.
 */
export interface StepFailed extends AiriEventBase {
	readonly type: "step.failed"

	readonly planId: string

	readonly stepId: string

	readonly stepName: string

	/** Structured error information. */
	readonly error: TaskError
}

// ── Union type ────────────────────────────────────────────────────────

/**
 * Discriminated union of all core AIRI event types.
 *
 * Consumers narrow via the `type` field:
 *
 * ```ts
 * function handle(event: AiriEvent) {
 *   switch (event.type) {
 *     case "task.started":  // event is TaskStarted
 *     case "tool.finished": // event is ToolFinished
 *   }
 * }
 * ```
 */
export type AiriEvent =
	| TaskStarted
	| TaskCompleted
	| TaskQueued
	| TaskProgress
	| TaskFailed
	| TaskCancelled
	| ToolCalled
	| ToolFinished
	| ModuleActivated
	| ModuleCrashed
	| WorkspaceCreated
	| ToolExecutionStarted
	| ToolExecutionCompleted
	| PatchGenerated
	| PatchApproved
	| PatchRejected
	| PlanStarted
	| PlanCompleted
	| PlanFailed
	| PlanCancelled
	| StepStarted
	| StepCompleted
	| StepFailed
	| ToolRegistered
	| ToolDeregistered
	| CapabilityRegistered
	| CapabilityRemoved
	| ToolExecutionFailed
	| ToolExecutionCancelled

// ── Capability & tool registration events ──────────────────────────────

/**
 * Emitted when a tool is registered.
 */
export interface ToolRegistered extends AiriEventBase {
	readonly type: "tool.registered"

	/** The tool identifier. */
	readonly toolId: ToolId

	/** The capability this tool belongs to. */
	readonly capabilityId: CapabilityId

	/** Human-readable tool name. */
	readonly name: string
}

/**
 * Emitted when a tool is deregistered.
 */
export interface ToolDeregistered extends AiriEventBase {
	readonly type: "tool.deregistered"

	readonly toolId: ToolId

	readonly capabilityId: CapabilityId
}

/**
 * Emitted when a capability is registered.
 */
export interface CapabilityRegistered extends AiriEventBase {
	readonly type: "capability.registered"

	readonly capabilityId: CapabilityId

	/** Human-readable capability name. */
	readonly name: string

	/** The module that owns this capability. */
	readonly moduleId: string

	/** Number of tools in this capability. */
	readonly toolCount: number
}

/**
 * Emitted when a capability is removed.
 */
export interface CapabilityRemoved extends AiriEventBase {
	readonly type: "capability.removed"

	readonly capabilityId: CapabilityId

	/** Human-readable capability name. */
	readonly name: string
}

/**
 * Emitted when a tool execution fails.
 */
export interface ToolExecutionFailed extends AiriEventBase {
	readonly type: "tool.execution.failed"

	/** Unique execution identifier. */
	readonly executionId: string

	readonly toolId: ToolId

	readonly taskId: string

	/** Error details. */
	readonly error: {
		readonly code: string
		readonly message: string
	}
}

/**
 * Emitted when a tool execution is cancelled.
 */
export interface ToolExecutionCancelled extends AiriEventBase {
	readonly type: "tool.execution.cancelled"

	/** Unique execution identifier. */
	readonly executionId: string

	readonly toolId: ToolId

	readonly taskId: string

	/** Optional cancellation reason. */
	readonly reason?: string
}
