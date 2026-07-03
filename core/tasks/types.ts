/**
 * AIRI Core — Task Model
 *
 * Defines the data model for the task orchestration layer.
 * Tasks are the fundamental unit of work in the AIRI daemon.
 *
 * Design principles:
 * - Branded types for ID safety (TaskId cannot be confused with raw strings).
 * - All timestamps are ISO-8601 for serialization safety.
 * - TaskState is a closed union — invalid transitions are unrepresentable.
 * - Metadata is an escape hatch for module-specific data without breaking the contract.
 */

// ── Branded ID ──────────────────────────────────────────────────────────

/**
 * Opaque task identifier.
 *
 * Created via createTaskId() to ensure brand safety at creation sites.
 */
export type TaskId = string & { readonly __brand: 'TaskId' }

/**
 * Create a branded TaskId from a raw string.
 *
 * Use this at task creation sites to ensure type safety.
 *
 * @example
 * ```ts
 * const id = createTaskId(crypto.randomUUID())
 * ```
 */
export function createTaskId(raw: string): TaskId {
  return raw as TaskId
}

// ── State machine ────────────────────────────────────────────────────────

/**
 * Valid task states.
 *
 * State machine:
 * ```
 * pending → queued → running → completed
 *                  ↘          ↗
 *                   failed
 *                   cancelled
 * ```
 */
export type TaskState
  = | 'pending'
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

/**
 * Valid state transitions.
 * Maps each state to the set of states it can transition to.
 */
export const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  pending: ['queued', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

/**
 * Check whether a state transition is valid.
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}

// ── Priority ─────────────────────────────────────────────────────────────

/**
 * Task priority levels.
 * Ordered from lowest to highest urgency.
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

/**
 * Priority numeric values for comparison.
 * Higher number = higher priority.
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
}

// ── Status ───────────────────────────────────────────────────────────────

/**
 * Snapshot of a task's current status.
 */
export interface TaskStatus {
  /** Current state in the lifecycle. */
  readonly state: TaskState

  /** Progress percentage (0-100). */
  readonly progress: number

  /** Human-readable progress message. */
  readonly message?: string

  /** ISO-8601 timestamp of the last status update. */
  readonly updatedAt: string

  /** ISO-8601 timestamp when the task was created. */
  readonly createdAt: string

  /** ISO-8601 timestamp when the task started executing. */
  readonly startedAt?: string

  /** ISO-8601 timestamp when the task completed/failed/cancelled. */
  readonly completedAt?: string
}

// ── Result & Error ───────────────────────────────────────────────────────

/**
 * Successful task execution result.
 */
export interface TaskResult {
  /** Whether the task completed successfully. */
  readonly success: boolean

  /** Task output data (module-specific). */
  readonly output?: unknown

  /** Error message when success is false. */
  readonly error?: string
}

/**
 * Structured task error.
 */
export interface TaskError {
  /** Machine-readable error code (e.g. "EXECUTION_FAILED", "TIMEOUT"). */
  readonly code: string

  /** Human-readable error description. */
  readonly message: string

  /** Whether this error is potentially recoverable via retry. */
  readonly recoverable: boolean

  /** Optional structured error details. */
  readonly details?: unknown
}

// ── Cancellation ─────────────────────────────────────────────────────────

/**
 * Cancellation record for a task.
 */
export interface TaskCancellation {
  /** Whether the task has been cancelled. */
  readonly isCancelled: boolean

  /** ISO-8601 timestamp of cancellation. */
  readonly cancelledAt?: string

  /** Reason for cancellation. */
  readonly reason?: string
}

// ── Isolation level ────────────────────────────────────────────────────

/**
 * Isolation level for task execution.
 * - "process": execute in an isolated worker process (current default).
 * - "vm": future — execute in a VM sandbox.
 * - "container": future — execute in a container.
 */
export type TaskIsolationLevel = 'process' | 'vm' | 'container'

// ── Task ─────────────────────────────────────────────────────────────────

/**
 * The primary task interface.
 *
 * A task represents a single unit of work managed by the AIRI daemon.
 * Tasks are created by modules, queued by the TaskManager, dispatched by
 * the Scheduler, and executed by TaskExecutors.
 *
 * Tasks are immutable snapshots — state changes produce new task objects
 * (the TaskManager handles this internally).
 */
export interface Task {
  /** Unique, branded task identifier. */
  readonly id: TaskId

  /** Human-readable title. */
  readonly title: string

  /** Optional detailed description. */
  readonly description?: string

  /** Current lifecycle state. */
  readonly state: TaskState

  /** Task priority. */
  readonly priority: TaskPriority

  /** Module that owns this task. */
  readonly moduleId: string

  /** Session that originated this task, if any. */
  readonly sessionId?: string

  /** ISO-8601 creation timestamp. */
  readonly createdAt: string

  /** ISO-8601 last-update timestamp. */
  readonly updatedAt: string

  /** ISO-8601 timestamp when execution started. */
  readonly startedAt?: string

  /** ISO-8601 timestamp when execution completed/failed/cancelled. */
  readonly completedAt?: string

  /** Progress percentage (0-100). */
  readonly progress: number

  /** Human-readable progress message. */
  readonly progressMessage?: string

  /** Execution result (populated on completion). */
  readonly result?: TaskResult

  /** Error details (populated on failure). */
  readonly error?: TaskError

  /** Module-specific metadata. */
  readonly metadata: Record<string, unknown>

  /** Parent task ID, if this is a subtask. */
  readonly parentTaskId?: TaskId

  /** Cancellation state. */
  readonly cancellation: TaskCancellation

  /** Worker process that is/was executing this task, if any. */
  readonly workerId?: string

  /** Number of execution attempts (incremented on worker crash retry). @default 0 */
  readonly executionAttempt: number

  /** Isolation level for task execution. @default "process" */
  readonly isolationLevel: TaskIsolationLevel
}

// ── Task creation input ──────────────────────────────────────────────────

/**
 * Parameters for creating a new task.
 */
export interface CreateTaskInput {
  /** Human-readable title. */
  readonly title: string

  /** Optional detailed description. */
  readonly description?: string

  /** Priority level. @default "normal" */
  readonly priority?: TaskPriority

  /** Owning module ID. @default "core" */
  readonly moduleId?: string

  /** Originating session ID, if any. */
  readonly sessionId?: string

  /** Module-specific metadata. @default {} */
  readonly metadata?: Record<string, unknown>

  /** Parent task ID, if this is a subtask. */
  readonly parentTaskId?: TaskId

  /** Isolation level for task execution. @default "process" */
  readonly isolationLevel?: TaskIsolationLevel
}

// ── Task filter ──────────────────────────────────────────────────────────

/**
 * Filter criteria for listing tasks.
 */
export interface TaskFilter {
  /** Filter by task state. */
  readonly state?: TaskState

  /** Filter by owning module. */
  readonly moduleId?: string

  /** Filter by session. */
  readonly sessionId?: string

  /** Filter by priority. */
  readonly priority?: TaskPriority

  /** Filter by parent task. */
  readonly parentTaskId?: TaskId
}
