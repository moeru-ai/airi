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

// ── Cancellation
export {
  CancellationTokenSource,
  createCancellationToken,
  createLinkedCancellationToken,
  withTimeout,
} from './cancellation.js'
export type { CancellationToken, UnsubscribeFn } from './cancellation.js'

// ── Executor
export type { CanExecuteResult, TaskExecutionContext, TaskExecutor } from './executor.js'
// ── Manager
export { TaskManager } from './manager.js'

export type { TaskManagerOptions } from './manager.js'

// ── Metrics
export { TaskMetrics } from './metrics.js'
export type { ModuleMetrics, TaskMetricsSnapshot } from './metrics.js'

// ── Replay Buffer
export { TaskReplayBuffer } from './replay-buffer.js'
export type { ReplayBufferOptions, ReplayEvent } from './replay-buffer.js'

// ── Scheduler
export { TaskScheduler } from './scheduler.js'
export type { SchedulerOptions } from './scheduler.js'

// ── Types
export type {
  CreateTaskInput,
  Task,
  TaskCancellation,
  TaskError,
  TaskFilter,
  TaskId,
  TaskIsolationLevel,
  TaskPriority,
  TaskResult,
  TaskState,
  TaskStatus,
} from './types.js'
export { createTaskId, isValidTransition, PRIORITY_WEIGHTS, VALID_TRANSITIONS } from './types.js'
