/**
 * AIRI Core — Public API
 *
 * Barrel export for all public core APIs. Import from `core/` to access
 * the event bus, runtime client, module registry, bootstrap, and logger.
 *
 * @example
 * ```ts
 * import { bootstrap, EventBus, createLogger } from '../core/index.js'
 * ```
 */

// ── Contracts (re-exported from existing files) ─────────────────────

export type {
	AiriModule,
	CoreContext,
	RuntimeClient as RuntimeClientContract,
} from "./modules/module.js"

export type {
	AiriEvent,
	AiriEventBase,
	TaskStarted,
	TaskCompleted,
	TaskQueued,
	TaskProgress,
	TaskFailed,
	TaskCancelled,
	ToolCalled,
	ToolFinished,
	ModuleActivated,
	ModuleCrashed,
	WorkspaceCreated,
	ToolExecutionStarted,
	ToolExecutionCompleted,
	PatchGenerated,
	PatchApproved,
	PatchRejected,
	PlanStarted,
	PlanCompleted,
	PlanFailed,
	PlanCancelled,
	StepStarted,
	StepCompleted,
	StepFailed,
	WorkspaceDestroyed,
	WorkspaceLeased,
	WorkspaceReleased,
	WorkspaceRecovered,
	WorkspaceCorrupted,
	WorktreeCreated,
	WorktreeRemoved,
} from "./events/types.js"

export type {
	RuntimeConnectionState,
	RuntimeMessageHandler,
	RuntimeStateHandler,
} from "./runtime/client.js"

// ── Implementations ──────────────────────────────────────────────────

export { EventBus } from "./events/bus.js"
export type { UnsubscribeFn } from "./events/bus.js"

export { createLocalRuntimeClient } from "./runtime/local-client.js"
export { LocalRuntimeClient } from "./runtime/local-client.js"

export { ModuleRegistry } from "./modules/registry.js"
export type {
	ModuleRegistryOptions,
	ActivationResult,
	ModuleActivationResult,
} from "./modules/registry.js"

export { createLogger, setLogLevel, getLogLevel } from "./logger.js"
export type { Logger, LogLevel } from "./logger.js"

export { bootstrap } from "./bootstrap.js"
export type { CoreInstance } from "./bootstrap.js"

// ── Task orchestration ──────────────────────────────────────────────

export {
	TaskManager,
	TaskScheduler,
	TaskMetrics,
	TaskReplayBuffer,
	createCancellationToken,
	createLinkedCancellationToken,
	CancellationTokenSource,
	withTimeout,
	createTaskId,
	isValidTransition,
	VALID_TRANSITIONS,
	PRIORITY_WEIGHTS,
} from "./tasks/index.js"

export type {
	TaskId,
	TaskState,
	TaskPriority,
	TaskStatus,
	TaskResult,
	TaskError,
	TaskCancellation,
	Task,
	CreateTaskInput,
	TaskFilter,
	TaskIsolationLevel,
	TaskExecutor,
	TaskExecutionContext,
	TaskManagerOptions,
	SchedulerOptions,
	TaskMetricsSnapshot,
	ModuleMetrics,
	ReplayEvent,
	ReplayBufferOptions,
	CancellationToken,
	UnsubscribeFn as TaskUnsubscribeFn,
} from "./tasks/index.js"

// ── Worker runtime ──────────────────────────────────────────────────

export { WorkerManager } from "./workers/manager.js"
export type {
	WorkerManagerOptions,
	WorkerState,
	WorkerInfo,
} from "./workers/manager.js"

export { WorkerMetrics } from "./workers/metrics.js"
export type { WorkerMetricsSnapshot } from "./workers/metrics.js"

export {
	WORKER_ERROR_CODES,
	serializeWorkerMessage,
	deserializeWorkerMessage,
} from "./workers/protocol.js"

export type {
	WorkerMessage,
	WorkerMessageType,
	WorkerMessageBase,
	WorkerHelloMessage,
	WorkerReadyMessage,
	WorkerHeartbeatMessage,
	WorkerShutdownMessage,
	ExecuteTaskMessage,
	TaskProgressMessage,
	TaskResultMessage,
	TaskFailureMessage,
	WorkerCapabilities,
	TaskPayload,
	WorkerErrorCode,
} from "./workers/protocol.js"

// ── Capability runtime ────────────────────────────────────────────────

export { CapabilityRegistry } from "./capabilities/index.js"
export type {
	CapabilityId,
	ToolId,
	CapabilityDescriptor,
	ToolDescriptor,
	ToolExecutionContext,
	ToolExecutionResult,
	CapabilityStatus,
	CapabilityInfo,
} from "./capabilities/index.js"

export type { ToolRuntime } from "./runtime/tool-runtime.js"
export { LocalToolRuntime } from "./runtime/local-tool-runtime.js"
export type { ToolHandler } from "./runtime/local-tool-runtime.js"
export { ExecutionTrace, redactSensitive } from "./runtime/execution-trace.js"
export type {
	ExecutionTraceEntry,
	ExecutionTraceFilter,
} from "./runtime/execution-trace.js"

// ── Planner layer ───────────────────────────────────────────────────

export { PlanExecutor, PlanRegistry } from "./planner/index.js"

export type {
	PlanExecutorOptions,
	PlanId,
	StepId,
	PlanStatus,
	StepStatus,
	PlanStep,
	StepResult,
	Plan,
	CreatePlanInput,
	PlanFilter,
} from "./planner/index.js"

// ── Persistence layer ────────────────────────────────────────────────

export { InMemoryEventStore, PersistedEventStore } from "./persistence/event-store.js"
export { InMemorySnapshotStore, SnapshotManager } from "./persistence/snapshots.js"

export type {
	EventId,
	PersistedEvent,
	PersistenceAdapter,
	PersistenceTransaction,
	EventStore,
	SnapshotStore,
	RuntimeStateStore,
	RuntimeSnapshot,
	RecoveryMetadata,
	SerializedPlan,
	SerializedPlanStep,
	SerializedTask,
	SerializedCapability,
	SerializedSession,
	SerializedExecutionState,
	PersistenceOptions,
} from "./persistence/index.js"

// ── Filesystem persistence adapters ──────────────────────────────────

export {
	FilesystemPersistenceAdapter,
	FilesystemTransaction,
	FilesystemEventStore,
	FilesystemSnapshotStore,
	FilesystemRuntimeStateStore,
} from "./persistence/adapters/filesystem/index.js"

// ── Persistent session management ────────────────────────────────────

export { PersistentSessionManager } from "./session/session-manager.js"
export { createPersistentSessionId } from "./session/types.js"

export type {
	PersistentSessionId,
	PersistentSession,
	SessionOwnership,
	SessionFilter,
	SessionReconnectResult,
} from "./session/types.js"

// ── Runtime recovery ─────────────────────────────────────────────────

export { RecoveryCoordinator } from "./runtime/recovery.js"

export type {
	RecoveryStarted,
	RecoveryCompleted,
	RecoveryFailed,
	RecoveryResult,
	RecoveryState,
} from "./runtime/recovery.js"

// ── Workspace isolation ────────────────────────────────────────────────

export {
	WorkspaceManager,
	WorkspaceStorage,
	WorkspaceWorktree,
	createWorkspaceId,
	isValidWorkspaceTransition,
	VALID_WORKSPACE_TRANSITIONS,
} from "./workspace/index.js"

export type {
	WorkspaceId,
	WorkspaceState,
	WorkspaceDescriptor,
	WorkspaceLease,
	WorkspaceSnapshot,
	WorkspaceRecoveryState,
	WorkspaceFilter,
	CreateWorkspaceInput,
	WorkspaceManagerOptions,
	WorktreeRecord,
} from "./workspace/index.js"

// ── Cognition layer ─────────────────────────────────────────────────────

export {
	CognitionCoordinator,
	PlanValidator,
	MockCognitionProvider,
	createProposal,
	proposalToPlan,
	summarizeProposal,
	extractCapabilityRequirements,
	extractWorkspaceRequirements,
	createProposalId,
	createReasoningId,
	createCognitionSessionId,
} from "./cognition/index.js"

export type {
	ProposalId,
	ReasoningId,
	CognitionSessionId,
	CognitionRequest,
	CognitionContext,
	PlanSummary,
	ExecutionSummary,
	CognitionConstraints,
	CognitionResponse,
	ModelInfo,
	TokenUsage,
	PlanProposal,
	ProposedStep,
	WorkspaceRequirements,
	EstimatedExecution,
	ReasoningTrace,
	ReasoningEntry,
	CognitionModel,
	ModelCapabilities,
	CognitionSession,
	ValidationResult,
	ValidationError,
	ValidationWarning,
	CognitionProvider,
	CognitionProviderOptions,
	CognitionPipelineResult,
} from "./cognition/index.js"

export type {
	CognitionRequested,
	CognitionCompleted,
	CognitionFailed,
	PlanProposed,
	PlanValidated,
	PlanRejected,
	CognitionEvent,
} from "./cognition/events.js"
