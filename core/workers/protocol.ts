/**
 * AIRI Core — Worker IPC Protocol
 *
 * Transport-independent message envelopes for daemon ↔ worker communication
 * over stdio. Uses the same message envelope pattern as core/ipc/protocol.ts
 * (id, type, timestamp) with a discriminated union of worker-specific message types.
 *
 * All messages are plain objects — serialization-safe (JSON-compatible).
 */

// ── Message type discriminants ────────────────────────────────────────

export type WorkerMessageType
  = | 'worker.hello'
    | 'worker.ready'
    | 'worker.heartbeat'
    | 'worker.shutdown'
    | 'execute.task'
    | 'task.progress'
    | 'task.result'
    | 'task.failure'

// ── Base envelope ─────────────────────────────────────────────────────

/**
 * Base fields present on every worker IPC message.
 */
export interface WorkerMessageBase {
  /** Unique message identifier (UUID v4). */
  readonly id: string

  /** Discriminant — determines which concrete type to use. */
  readonly type: WorkerMessageType

  /** ISO-8601 timestamp of when the message was created. */
  readonly timestamp: string
}

// ── Worker → Daemon messages ──────────────────────────────────────────

/**
 * Worker announces itself to the daemon upon startup.
 *
 * Carries capabilities so the daemon can route tasks to appropriate workers.
 */
export interface WorkerHelloMessage extends WorkerMessageBase {
  readonly type: 'worker.hello'

  /** Worker process identifier (from the daemon's perspective). */
  readonly workerId: string

  /**
   * Capabilities this worker supports.
   * Used by the daemon to match workers to tasks.
   */
  readonly capabilities: WorkerCapabilities
}

/**
 * Worker is idle and ready to accept a task.
 */
export interface WorkerReadyMessage extends WorkerMessageBase {
  readonly type: 'worker.ready'

  readonly workerId: string
}

/**
 * Periodic liveness ping from worker to daemon.
 */
export interface WorkerHeartbeatMessage extends WorkerMessageBase {
  readonly type: 'worker.heartbeat'

  readonly workerId: string
}

/**
 * Graceful shutdown notice from worker.
 *
 * The worker sends this before exiting so the daemon can clean up
 * without waiting for heartbeat timeout.
 */
export interface WorkerShutdownMessage extends WorkerMessageBase {
  readonly type: 'worker.shutdown'

  readonly workerId: string

  /** Optional reason for shutdown. */
  readonly reason?: string
}

// ── Daemon → Worker messages ──────────────────────────────────────────

/**
 * Assign a task to a worker for execution.
 */
export interface ExecuteTaskMessage extends WorkerMessageBase {
  readonly type: 'execute.task'

  /** The task to execute (full task snapshot). */
  readonly task: TaskPayload

  /** Module ID that owns the executor for this task. */
  readonly moduleId: string
}

// ── Worker → Daemon task result messages ──────────────────────────────

/**
 * Progress update during task execution.
 */
export interface TaskProgressMessage extends WorkerMessageBase {
  readonly type: 'task.progress'

  readonly workerId: string

  readonly taskId: string

  /** Progress percentage (0-100). */
  readonly progress: number

  /** Optional human-readable progress message. */
  readonly message?: string
}

/**
 * Successful task completion.
 */
export interface TaskResultMessage extends WorkerMessageBase {
  readonly type: 'task.result'

  readonly workerId: string

  readonly taskId: string

  /** Task execution result. */
  readonly result: {
    readonly success: boolean
    readonly output?: unknown
  }
}

/**
 * Task execution failed.
 */
export interface TaskFailureMessage extends WorkerMessageBase {
  readonly type: 'task.failure'

  readonly workerId: string

  readonly taskId: string

  /** Structured error information. */
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details?: unknown
  }
}

// ── Union type ────────────────────────────────────────────────────────

/**
 * Discriminated union of all worker IPC message types.
 */
export type WorkerMessage
  = | WorkerHelloMessage
    | WorkerReadyMessage
    | WorkerHeartbeatMessage
    | WorkerShutdownMessage
    | ExecuteTaskMessage
    | TaskProgressMessage
    | TaskResultMessage
    | TaskFailureMessage

// ── Payload types ─────────────────────────────────────────────────────

/**
 * Worker capabilities advertised at hello time.
 */
export interface WorkerCapabilities {
  /** Module IDs this worker can execute tasks for. */
  readonly moduleIds: string[]

  /** Maximum concurrent tasks (currently always 1 per worker process). */
  readonly maxConcurrent: number
}

/**
 * Task payload sent to a worker via ExecuteTaskMessage.
 *
 * This is a serializable subset of the Task interface, containing
 * everything the worker needs to execute the task.
 */
export interface TaskPayload {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly priority: string
  readonly moduleId: string
  readonly sessionId?: string
  readonly metadata: Record<string, unknown>
}

// ── Serialization helpers ─────────────────────────────────────────────

/**
 * Serialize a worker message to a JSON string.
 */
export function serializeWorkerMessage(msg: WorkerMessage): string {
  return JSON.stringify(msg)
}

/**
 * Deserialize a JSON string into a worker message.
 *
 * Returns null if the input is not valid JSON or does not conform to
 * the WorkerMessage shape.
 */
export function deserializeWorkerMessage(raw: string): WorkerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isValidWorkerMessage(parsed))
      return null
    return parsed
  }
  catch {
    return null
  }
}

// ── Type guard ────────────────────────────────────────────────────────

function isValidWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null)
    return false

  const obj = value as Record<string, unknown>

  if (typeof obj.id !== 'string')
    return false
  if (typeof obj.type !== 'string')
    return false
  if (typeof obj.timestamp !== 'string')
    return false

  const validTypes: string[] = [
    'worker.hello',
    'worker.ready',
    'worker.heartbeat',
    'worker.shutdown',
    'execute.task',
    'task.progress',
    'task.result',
    'task.failure',
  ]

  return validTypes.includes(obj.type)
}

// ── Error codes ───────────────────────────────────────────────────────

/**
 * Error codes used in TaskFailureMessage.
 */
export const WORKER_ERROR_CODES = {
  /** Worker process crashed during execution. */
  WORKER_CRASHED: 'WORKER_CRASHED',

  /** Executor for the task module was not found in the worker. */
  EXECUTOR_NOT_FOUND: 'EXECUTOR_NOT_FOUND',

  /** Task execution timed out. */
  TASK_TIMEOUT: 'TASK_TIMEOUT',

  /** Worker failed to initialize. */
  WORKER_INIT_FAILED: 'WORKER_INIT_FAILED',

  /** Generic execution error. */
  EXECUTION_ERROR: 'EXECUTION_ERROR',
} as const

export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[keyof typeof WORKER_ERROR_CODES]
