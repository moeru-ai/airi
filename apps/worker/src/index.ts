/**
 * AIRI Worker — Entry Point
 *
 * A standalone Node.js process that executes tasks in isolation.
 * Communicates with the daemon via stdio using length-prefixed JSON framing.
 *
 * Lifecycle:
 * 1. Send WorkerHello with capabilities
 * 2. Wait for ExecuteTask messages
 * 3. On task: import executor, run with synthetic context, send result
 * 4. Loop back to ready state
 *
 * Shutdown: SIGTERM triggers graceful shutdown (send WorkerShutdown, exit).
 */

import { stdin, stdout } from 'node:process'

import {
  WORKER_ERROR_CODES,
  type WorkerMessage,
  type WorkerHelloMessage,
  type WorkerReadyMessage,
  type WorkerHeartbeatMessage,
  type WorkerShutdownMessage,
  type ExecuteTaskMessage,
  type TaskProgressMessage,
  type TaskResultMessage,
  type TaskFailureMessage,
  type WorkerCapabilities,
  serializeWorkerMessage,
  deserializeWorkerMessage,
} from '../../../core/workers/protocol.js'
import type { TaskExecutor, TaskExecutionContext } from '../../../core/tasks/executor.js'
import type { CancellationToken } from '../../../core/tasks/cancellation.js'
import type { EventBus } from '../../../core/modules/module.js'
import type { Logger } from '../../../core/logger.js'
import type { TaskId } from '../../../core/tasks/types.js'

// ── State ───────────────────────────────────────────────────────────────

const workerId = process.env.AIRI_WORKER_ID ?? `worker-${process.pid}`
let currentTaskId: string | null = null
let shutdownRequested = false

// ── Stdio framing ───────────────────────────────────────────────────────

const HEADER_SIZE = 4
const MAX_MESSAGE_SIZE = 1024 * 1024

let readBuffer = Buffer.alloc(0)
let expectedLength: number | null = null

/**
 * Set up stdin reading with length-prefixed JSON framing.
 */
function setupStdin(): void {
  stdin.setEncoding('utf-8')

  stdin.on('data', (chunk: string | Buffer) => {
    const data = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk
    readBuffer = Buffer.concat([readBuffer, data])

    while (true) {
      if (expectedLength === null) {
        if (readBuffer.length < HEADER_SIZE) break

        expectedLength = readBuffer.readUInt32BE(0)

        if (expectedLength > MAX_MESSAGE_SIZE) {
          console.error(`[Worker ${workerId}] Message too large (${expectedLength} bytes), ignoring.`)
          expectedLength = null
          readBuffer = Buffer.alloc(0)
          break
        }

        readBuffer = readBuffer.subarray(HEADER_SIZE)
      }

      if (readBuffer.length < expectedLength) break

      const messageBytes = readBuffer.subarray(0, expectedLength)
      readBuffer = readBuffer.subarray(expectedLength)
      expectedLength = null

      try {
        const json = messageBytes.toString('utf-8')
        const message = deserializeWorkerMessage(json)
        if (message) {
          handleMessage(message)
        }
      } catch (error) {
        console.error(
          `[Worker ${workerId}] Failed to parse message:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  })

  stdin.on('end', () => {
    // Daemon closed stdin — exit gracefully.
    shutdown('stdin closed')
  })

  stdin.on('error', (err) => {
    console.error(`[Worker ${workerId}] stdin error:`, err.message)
  })
}

/**
 * Send a message to the daemon via stdout.
 */
function sendMessage(message: WorkerMessage): void {
  const json = serializeWorkerMessage(message)
  const payload = Buffer.from(json, 'utf-8')
  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt32BE(payload.length, 0)
  stdout.write(Buffer.concat([header, payload]))
}

// ── Message handling ────────────────────────────────────────────────────

function handleMessage(message: WorkerMessage): void {
  switch (message.type) {
    case 'execute.task':
      handleExecuteTask(message)
      break

    default:
      console.error(`[Worker ${workerId}] Unexpected message type: ${message.type}`)
  }
}

// ── Task execution ──────────────────────────────────────────────────────

async function handleExecuteTask(message: ExecuteTaskMessage): Promise<void> {
  if (currentTaskId) {
    console.error(`[Worker ${workerId}] Already executing task ${currentTaskId}, ignoring new task.`)
    return
  }

  currentTaskId = message.task.id
  const task = message.task

  sendProgress(task.id, 0, 'starting')

  try {
    // Import the executor for this module.
    const executor = await importExecutor(message.moduleId)

    if (!executor) {
      sendFailure(task.id, {
        code: WORKER_ERROR_CODES.EXECUTOR_NOT_FOUND,
        message: `No executor found for module: ${message.moduleId}`,
      })
      currentTaskId = null
      sendReady()
      return
    }

    // Create a synthetic execution context.
    const ctx = createExecutionContext(task.id)

    // Execute the task.
    // TaskPayload is a serializable subset of Task, so we cast here.
    const result = await executor.execute(task as Parameters<typeof executor.execute>[0], ctx)

    if (result.success) {
      sendResult(task.id, { success: true, output: result.output })
    } else {
      sendFailure(task.id, {
        code: WORKER_ERROR_CODES.EXECUTION_ERROR,
        message: result.error ?? 'Task execution failed',
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    sendFailure(task.id, {
      code: WORKER_ERROR_CODES.EXECUTION_ERROR,
      message: errorMessage,
      details: error,
    })
  } finally {
    currentTaskId = null
    sendReady()
  }
}

/**
 * Import the executor for a given module.
 *
 * In a real implementation, this would dynamically import the module's
 * executor. For now, we use a simple registry.
 */
async function importExecutor(moduleId: string): Promise<TaskExecutor | null> {
  // Validate moduleId to prevent path traversal.
  const SAFE_MODULE_ID = /^[a-zA-Z0-9_-]+$/
  if (!SAFE_MODULE_ID.test(moduleId)) {
    console.error(`[Worker ${workerId}] Rejected unsafe moduleId: ${moduleId}`)
    return null
  }

  // Dynamic import based on module ID.
  // This is a simplified approach — in production, you'd have a proper
  // module registry that maps module IDs to executor factories.
  try {
    const module = await import(`../../../modules/${moduleId}/airios.module.js`)
    return module.executor as TaskExecutor
  } catch {
    return null
  }
}

/**
 * Create a synthetic TaskExecutionContext for cross-process execution.
 */
function createExecutionContext(taskId: string): TaskExecutionContext {
  const token: CancellationToken = {
    isCancelled: false,
    onCancelled: () => () => {},
    throwIfCancelled: () => {},
  }

  return {
    task: {
      id: taskId as TaskId,
      title: '',
      state: 'running',
      priority: 'normal',
      moduleId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      metadata: {},
      cancellation: { isCancelled: false },
      executionAttempt: 0,
      isolationLevel: 'process',
    },
    token,
    reportProgress: (percent: number, message?: string) => {
      sendProgress(taskId, percent, message)
    },
    events: {
      on: () => () => {},
      once: () => () => {},
      emit: () => {},
      publish: async () => {},
      subscribe: () => () => {},
      listenerCount: () => 0,
      clear: () => {},
    } as EventBus,
    logger: {
      debug: (..._args: unknown[]) => {},
      info: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {},
    } as Logger,
  }
}

// ── Message sending helpers ─────────────────────────────────────────────

function sendHello(): void {
  const capabilities: WorkerCapabilities = {
    moduleIds: ['code'],
    maxConcurrent: 1,
  }

  const message: WorkerHelloMessage = {
    id: crypto.randomUUID(),
    type: 'worker.hello',
    timestamp: new Date().toISOString(),
    workerId,
    capabilities,
  }

  sendMessage(message)
}

function sendReady(): void {
  const message: WorkerReadyMessage = {
    id: crypto.randomUUID(),
    type: 'worker.ready',
    timestamp: new Date().toISOString(),
    workerId,
  }

  sendMessage(message)
}

function sendHeartbeat(): void {
  const message: WorkerHeartbeatMessage = {
    id: crypto.randomUUID(),
    type: 'worker.heartbeat',
    timestamp: new Date().toISOString(),
    workerId,
  }

  sendMessage(message)
}

function sendShutdown(reason?: string): void {
  const message: WorkerShutdownMessage = {
    id: crypto.randomUUID(),
    type: 'worker.shutdown',
    timestamp: new Date().toISOString(),
    workerId,
    reason,
  }

  sendMessage(message)
}

function sendProgress(taskId: string, progress: number, message?: string): void {
  const msg: TaskProgressMessage = {
    id: crypto.randomUUID(),
    type: 'task.progress',
    timestamp: new Date().toISOString(),
    workerId,
    taskId,
    progress,
    message,
  }

  sendMessage(msg)
}

function sendResult(taskId: string, result: { success: boolean; output?: unknown }): void {
  const msg: TaskResultMessage = {
    id: crypto.randomUUID(),
    type: 'task.result',
    timestamp: new Date().toISOString(),
    workerId,
    taskId,
    result,
  }

  sendMessage(msg)
}

function sendFailure(taskId: string, error: { code: string; message: string; details?: unknown }): void {
  const msg: TaskFailureMessage = {
    id: crypto.randomUUID(),
    type: 'task.failure',
    timestamp: new Date().toISOString(),
    workerId,
    taskId,
    error,
  }

  sendMessage(msg)
}

// ── Shutdown ────────────────────────────────────────────────────────────

function shutdown(reason?: string): void {
  if (shutdownRequested) return
  shutdownRequested = true

  sendShutdown(reason ?? 'unknown')

  // Give the daemon a moment to receive the message.
  setTimeout(() => {
    process.exit(0)
  }, 100)
}

// ── Startup ─────────────────────────────────────────────────────────────

function start(): void {
  // Set up stdin reading.
  setupStdin()

  // Send hello.
  sendHello()

  // Start heartbeat interval.
  const heartbeatInterval = setInterval(() => {
    if (!shutdownRequested) {
      sendHeartbeat()
    }
  }, 10_000)

  // Handle SIGTERM for graceful shutdown.
  process.on('SIGTERM', () => {
    clearInterval(heartbeatInterval)
    shutdown('SIGTERM received')
  })

  // Handle SIGINT as well.
  process.on('SIGINT', () => {
    clearInterval(heartbeatInterval)
    shutdown('SIGINT received')
  })

  // Handle uncaught errors — log to stderr but don't crash silently.
  process.on('uncaughtException', (error) => {
    console.error(`[Worker ${workerId}] Uncaught exception:`, error.message)
    if (currentTaskId) {
      sendFailure(currentTaskId, {
        code: WORKER_ERROR_CODES.WORKER_CRASHED,
        message: `Uncaught exception: ${error.message}`,
        details: error,
      })
      currentTaskId = null
    }
  })

  process.on('unhandledRejection', (reason) => {
    console.error(
      `[Worker ${workerId}] Unhandled rejection:`,
      reason instanceof Error ? reason.message : String(reason),
    )
  })

  console.error(`[Worker ${workerId}] Started. PID: ${process.pid}`)
}

start()
