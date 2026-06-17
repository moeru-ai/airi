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
import type { WorkspaceId, WorkspaceState } from "../workspace/types.js"
import type { ProposalId, ReasoningId } from "../cognition/types.js"
import type { MemoryId, RepositoryMapId } from "../memory/types.js"

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
	| PersistedToolExecutionStarted
	| PersistedToolExecutionCompleted
	| PersistedToolExecutionFailed
	| WorkspaceCreated
	| WorkspaceDestroyed
	| WorkspaceLeased
	| WorkspaceReleased
	| WorkspaceRecovered
	| WorkspaceCorrupted
	| WorktreeCreated
	| WorktreeRemoved
	| MemoryStored
	| MemoryRetrieved
	| MemoryUpdated
	| MemoryRemoved
	| RepositoryIndexed
	| DecisionRecorded
	| FailureRecorded
	| FailurePatternDetected


// ── Cognition events ──────────────────────────────────────────────────


/**
 * Emitted when a cognition request is made.
 */
export interface CognitionRequested extends AiriEventBase {
	readonly type: "cognition.requested"

	/** The reasoning request identifier. */
	readonly requestId: ReasoningId

	/** Associated session, if any. */
	readonly sessionId?: string

	/** Target workspace, if scoped. */
	readonly workspaceId?: string
}

/**
 * Emitted when a cognition request completes successfully.
 */
export interface CognitionCompleted extends AiriEventBase {
	readonly type: "cognition.completed"

	/** The reasoning request identifier. */
	readonly requestId: ReasoningId

	/** The generated proposal identifier. */
	readonly proposalId: ProposalId

	/** Model that produced the proposal. */
	readonly modelInfo: ModelInfo

	/** Generation duration in milliseconds. */
	readonly durationMs: number
}

/**
 * Emitted when a cognition request fails.
 */
export interface CognitionFailed extends AiriEventBase {
	readonly type: "cognition.failed"

	/** The reasoning request identifier. */
	readonly requestId: ReasoningId

	/** Human-readable error message. */
	readonly error: string

	/** Model info, if available before failure. */
	readonly modelInfo?: ModelInfo
}

/**
 * Emitted when a plan proposal is generated.
 */
export interface PlanProposed extends AiriEventBase {
	readonly type: "plan.proposed"

	/** The proposal identifier. */
	readonly proposalId: ProposalId

	/** The reasoning request that generated this proposal. */
	readonly requestId: ReasoningId

	/** Human-readable proposal name. */
	readonly name: string

	/** Number of steps in the proposal. */
	readonly stepCount: number

	/** Model's self-reported confidence (0-1). */
	readonly confidence?: number
}

/**
 * Emitted when a plan proposal is validated and accepted.
 */
export interface PlanValidated extends AiriEventBase {
	readonly type: "plan.validated"

	/** The proposal identifier. */
	readonly proposalId: ProposalId

	/** The PlanId it was converted to. */
	readonly planId: string

	/** The validation result. */
	readonly validationResult: { readonly valid: boolean; readonly errors: unknown[]; readonly warnings: unknown[] }
}

/**
 * Emitted when a plan proposal is rejected by validation.
 */
export interface PlanRejected extends AiriEventBase {
	readonly type: "plan.rejected"

	/** The proposal identifier. */
	readonly proposalId: ProposalId

	/** Human-readable rejection reason. */
	readonly reason: string

	/** The validation result with error details. */
	readonly validationResult: { readonly valid: boolean; readonly errors: unknown[]; readonly warnings: unknown[] }
}
// ── Workspace isolation events ─────────────────────────────────────────

/**
 * Emitted when a new workspace is created.
 */
export interface WorkspaceCreated extends AiriEventBase {
	readonly type: "workspace.created"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** Human-readable workspace name. */
	readonly name: string

	/** Absolute path to the workspace root. */
	readonly rootPath: string

	/** Associated session, if any. */
	readonly sessionId?: string

	/** Associated repository, if any. */
	readonly repositoryId?: string

	/** Git branch name, if using worktree isolation. */
	readonly branchName?: string
}

/**
 * Emitted when a workspace is destroyed.
 */
export interface WorkspaceDestroyed extends AiriEventBase {
	readonly type: "workspace.destroyed"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** Human-readable workspace name. */
	readonly name: string

	/** Optional destruction reason. */
	readonly reason?: string
}

/**
 * Emitted when a workspace is leased to a session.
 */
export interface WorkspaceLeased extends AiriEventBase {
	readonly type: "workspace.leased"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** The session that holds the lease. */
	readonly sessionId: string

	/** Unique lease token for validation. */
	readonly leaseToken: string

	/** Optional lease expiry timestamp. */
	readonly expiresAt?: string
}

/**
 * Emitted when a workspace lease is released.
 */
export interface WorkspaceReleased extends AiriEventBase {
	readonly type: "workspace.released"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** The session that held the lease. */
	readonly sessionId: string

	/** The lease token that was released. */
	readonly leaseToken: string
}

/**
 * Emitted when a workspace is recovered after restart.
 */
export interface WorkspaceRecovered extends AiriEventBase {
	readonly type: "workspace.recovered"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** State before the crash/restart. */
	readonly previousState: WorkspaceState

	/** State after recovery. */
	readonly newState: WorkspaceState

	/** Whether reconciliation is needed. */
	readonly needsReconciliation: boolean
}

/**
 * Emitted when a workspace is detected as corrupted.
 */
export interface WorkspaceCorrupted extends AiriEventBase {
	readonly type: "workspace.corrupted"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** Error description. */
	readonly error: string

	/** Whether manual intervention is required. */
	readonly needsManualIntervention: boolean
}

/**
 * Emitted when a git worktree is created for a workspace.
 */
export interface WorktreeCreated extends AiriEventBase {
	readonly type: "worktree.created"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** Path to the primary repository. */
	readonly repositoryPath: string

	/** Path to the created worktree. */
	readonly worktreePath: string

	/** Git branch name, if not detached. */
	readonly branchName?: string
}

/**
 * Emitted when a git worktree is removed.
 */
export interface WorktreeRemoved extends AiriEventBase {
	readonly type: "worktree.removed"

	/** The workspace identifier. */
	readonly workspaceId: WorkspaceId

	/** Path to the removed worktree. */
	readonly worktreePath: string

	/** Optional removal reason. */
	readonly reason?: string
}

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

// ── Persisted tool execution events ────────────────────────────────────

/**
 * Persisted record of a tool execution start.
 *
 * Includes executionId for correlation across the full lifecycle
 * (started → completed/failed/cancelled).
 */
export interface PersistedToolExecutionStarted extends AiriEventBase {
	readonly type: "tool.execution.started"

	/** Unique execution identifier for correlation. */
	readonly executionId: string

	/** The tool being executed. */
	readonly toolId: ToolId

	/** The task this execution belongs to. */
	readonly taskId: string
}

/**
 * Persisted record of a tool execution completion.
 */
export interface PersistedToolExecutionCompleted extends AiriEventBase {
	readonly type: "tool.execution.completed"

	/** Unique execution identifier for correlation. */
	readonly executionId: string

	/** The tool that was executed. */
	readonly toolId: ToolId

	/** The task this execution belongs to. */
	readonly taskId: string

	/** Whether the tool execution succeeded. */
	readonly success: boolean

	/** Execution duration in milliseconds. */
	readonly durationMs: number
}

/**
 * Persisted record of a tool execution failure.
 */
export interface PersistedToolExecutionFailed extends AiriEventBase {
	readonly type: "tool.execution.failed"

	/** Unique execution identifier for correlation. */
	readonly executionId: string

	/** The tool that was executed. */
	readonly toolId: ToolId

	/** The task this execution belongs to. */
	readonly taskId: string

	/** Error details. */
	readonly error: {
		readonly code: string
		readonly message: string
	}
}


// ── Semantic memory events ────────────────────────────────────────────

/**
 * Emitted when a memory record is stored.
 */
export interface MemoryStored extends AiriEventBase {
	readonly type: "memory.stored"

	/** The memory record identifier. */
	readonly memoryId: MemoryId

	/** Memory scope. */
	readonly scope: string

	/** Memory type. */
	readonly memoryType: string

	/** Human-readable title. */
	readonly title: string
}

/**
 * Emitted when memories are retrieved for context.
 */
export interface MemoryRetrieved extends AiriEventBase {
	readonly type: "memory.retrieved"

	/** Number of results returned. */
	readonly resultCount: number

	/** The query text, if any. */
	readonly queryText?: string

	/** Associated request ID, if any. */
	readonly requestId?: string
}

/**
 * Emitted when a memory record is updated.
 */
export interface MemoryUpdated extends AiriEventBase {
	readonly type: "memory.updated"

	/** The memory record identifier. */
	readonly memoryId: MemoryId

	/** Human-readable title. */
	readonly title: string
}

/**
 * Emitted when a memory record is removed.
 */
export interface MemoryRemoved extends AiriEventBase {
	readonly type: "memory.removed"

	/** The memory record identifier. */
	readonly memoryId: MemoryId
}

/**
 * Emitted when a repository is indexed.
 */
export interface RepositoryIndexed extends AiriEventBase {
	readonly type: "repository.indexed"

	/** The repository map identifier. */
	readonly mapId: RepositoryMapId

	/** Repository path. */
	readonly repositoryPath: string

	/** Number of files indexed. */
	readonly filesIndexed: number

	/** Number of import edges found. */
	readonly importEdges: number
}

/**
 * Emitted when a decision is recorded.
 */
export interface DecisionRecorded extends AiriEventBase {
	readonly type: "decision.recorded"

	/** The memory record identifier. */
	readonly memoryId: MemoryId

	/** Decision type. */
	readonly decisionType: "accepted" | "rejected" | "revised"

	/** Associated proposal ID, if any. */
	readonly proposalId?: string

	/** Human-readable title. */
	readonly title: string
}

/**
 * Emitted when a failure is recorded.
 */
export interface FailureRecorded extends AiriEventBase {
	readonly type: "failure.recorded"

	/** The memory record identifier. */
	readonly memoryId: MemoryId

	/** Failure type. */
	readonly failureType: string

	/** Error signature. */
	readonly error: string
}

/**
 * Emitted when a recurring failure pattern is detected.
 */
export interface FailurePatternDetected extends AiriEventBase {
	readonly type: "failure.pattern.detected"

	/** Pattern identifier. */
	readonly patternId: string

	/** Pattern type. */
	readonly patternType: string

	/** Number of occurrences. */
	readonly occurrences: number

	/** Suggested action, if any. */
	readonly suggestedAction?: string
}
