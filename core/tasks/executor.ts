/**
 * AIRI Core — Task Execution Contract
 *
 * Defines the interface for task executors and the execution context
 * passed to them during task execution.
 *
 * Design decisions:
 * - Executors are module-owned: each module registers one executor.
 * - canExecute() enables capability-based dispatch (not just moduleId matching).
 * - TaskExecutionContext provides everything an executor needs — no globals.
 * - Progress reporting is push-based: executors call reportProgress().
 */

import type { EventBus } from '../events/bus.js'
import type { Logger } from '../logger.js'
import type { CancellationToken } from './cancellation.js'
import type { Task, TaskResult } from './types.js'

// ── Execution context ────────────────────────────────────────────────────

/**
 * Context provided to a TaskExecutor during execution.
 *
 * Executors use this to report progress, emit sub-events, check for
 * cancellation, and log. The context is scoped to a single task execution.
 */
export interface TaskExecutionContext {
  /** The task being executed. */
  readonly task: Task

  /**
   * Cancellation token for cooperative cancellation.
   *
   * Executors should check token.isCancelled or call token.throwIfCancelled()
   * at reasonable intervals (e.g. between steps in a multi-step task).
   */
  readonly token: CancellationToken

  /**
   * Report task progress.
   *
   * @param percent - Progress percentage (0-100).
   * @param message - Optional human-readable progress message.
   */
  reportProgress: (percent: number, message?: string) => void

  /**
   * Event bus for emitting sub-events during execution.
   *
   * Use this to emit tool.called / tool.finished events or other
   * module-specific events that should be visible to subscribers.
   */
  readonly events: EventBus

  /**
   * Structured logger tagged with the executing module's ID.
   */
  readonly logger: Logger
}

// ── Executor interface ───────────────────────────────────────────────────

/**
 * Capability check result.
 */
export interface CanExecuteResult {
  /** Whether this executor can handle the task. */
  readonly canExecute: boolean

  /** Human-readable reason if canExecute is false. */
  readonly reason?: string
}

/**
 * Task executor — the unit that actually runs tasks.
 *
 * Each module that wants to execute tasks registers a TaskExecutor
 * with the TaskManager. The scheduler uses canExecute() to find the
 * right executor for a task, then calls execute() to run it.
 *
 * Executors must be:
 * - Idempotent: calling execute() with the same task should not cause
 *   side effects beyond the intended execution.
 * - Cancellation-aware: check the token regularly and abort cleanly.
 * - Progress-aware: report progress at reasonable intervals.
 */
export interface TaskExecutor {
  /**
   * Check whether this executor can handle the given task.
   *
   * Called by the scheduler before execute(). Should be fast and
   * side-effect-free.
   *
   * @param task - The task to check.
   * @returns Whether this executor can execute the task.
   */
  canExecute: (task: Task) => boolean

  /**
   * Execute a task.
   *
   * This method should:
   * 1. Check the cancellation token before starting work.
   * 2. Report progress at reasonable intervals.
   * 3. Emit sub-events via the context's event bus.
   * 4. Return a TaskResult on success or throw on failure.
   *
   * @param task - The task to execute.
   * @param ctx - The execution context.
   * @returns The task result.
   * @throws If execution fails (the TaskManager will catch and wrap).
   */
  execute: (task: Task, ctx: TaskExecutionContext) => Promise<TaskResult>
}
