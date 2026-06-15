/**
 * AIRI Core — Task Orchestration Layer
 *
 * Barrel export for the task orchestration subsystem.
 *
 * @example
 * ```ts
 * import {
 *   TaskManager,
 *   TaskScheduler,
 *   TaskMetrics,
 *   TaskReplayBuffer,
 *   createCancellationToken,
 *   withTimeout,
 * } from '../core/tasks/index.js'
 * ```
 */

// ── Types
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
} from "./types.js"
export { createTaskId, isValidTransition, VALID_TRANSITIONS, PRIORITY_WEIGHTS } from "./types.js"

// ── Cancellation
export {
	createCancellationToken,
	createLinkedCancellationToken,
	CancellationTokenSource,
	withTimeout,
} from "./cancellation.js"
export type { CancellationToken, UnsubscribeFn } from "./cancellation.js"

// ── Executor
export type { TaskExecutor, TaskExecutionContext, CanExecuteResult } from "./executor.js"

// ── Manager
export { TaskManager } from "./manager.js"
export type { TaskManagerOptions } from "./manager.js"

// ── Scheduler
export { TaskScheduler } from "./scheduler.js"
export type { SchedulerOptions } from "./scheduler.js"

// ── Metrics
export { TaskMetrics } from "./metrics.js"
export type { TaskMetricsSnapshot, ModuleMetrics } from "./metrics.js"

// ── Replay Buffer
export { TaskReplayBuffer } from "./replay-buffer.js"
export type { ReplayEvent, ReplayBufferOptions } from "./replay-buffer.js"
