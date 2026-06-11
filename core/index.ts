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
