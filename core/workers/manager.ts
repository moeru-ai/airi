/**
 * AIRI Core — Worker Manager
 *
 * Manages a pool of worker processes that execute tasks in isolation.
 * The daemon (orchestration kernel) dispatches tasks to workers via
 * this manager; workers are disposable execution environments.
 *
 * Design decisions:
 * - Class-based, not a global singleton. Instantiate per daemon.
 * - Each worker runs in its own Node.js subprocess.
 * - Crash recovery: if a worker dies mid-task, the task is failed and retried.
 * - Quarantine: workers that crash too frequently are stopped.
 * - Heartbeat monitoring: unresponsive workers are killed and replaced.
 */

import { fork, type ChildProcess } from "node:child_process"
import { join } from "node:path"

import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type { Task, TaskError } from "../tasks/types.js"
import type { TaskExecutor } from "../tasks/executor.js"
import { StdioWorkerTransport } from "./transport.js"
import type { WorkerTransport } from "./transport.js"
import {
	WORKER_ERROR_CODES,
	type WorkerMessage,
	type WorkerHelloMessage,
	type WorkerReadyMessage,
	type WorkerHeartbeatMessage,
	type WorkerShutdownMessage,
	type TaskProgressMessage,
	type TaskResultMessage,
	type TaskFailureMessage,
	type ExecuteTaskMessage,
	type TaskPayload,
} from "./protocol.js"
import { WorkerMetrics } from "./metrics.js"

// ── Configuration ────────────────────────────────────────────────────────

export interface WorkerManagerOptions {
	/** Number of workers to spawn initially. @default 2 */
	readonly poolSize?: number

	/**
	 * Path to the worker entry point script.
	 * @default resolved relative to the core package output.
	 */
	readonly workerScriptPath?: string

	/**
	 * Interval in milliseconds for heartbeat checks.
	 * @default 10_000 (10 seconds)
	 */
	readonly heartbeatCheckIntervalMs?: number

	/**
	 * Timeout in milliseconds before a worker is considered unresponsive.
	 * @default 30_000 (30 seconds)
	 */
	readonly heartbeatTimeoutMs?: number

	/**
	 * Maximum number of crashes within the quarantine window before
	 * a worker is permanently stopped.
	 * @default 3
	 */
	readonly maxCrashesBeforeQuarantine?: number

	/**
	 * Time window in milliseconds for counting crashes toward quarantine.
	 * @default 60_000 (60 seconds)
	 */
	readonly quarantineWindowMs?: number

	/**
	 * Graceful shutdown timeout in milliseconds.
	 * After this, workers are SIGKILLed.
	 * @default 5_000 (5 seconds)
	 */
	readonly shutdownTimeoutMs?: number
}

// ── Worker state ────────────────────────────────────────────────────────

/**
 * Lifecycle states for a managed worker.
 */
export type WorkerState =
	| "starting"
	| "ready"
	| "busy"
	| "unresponsive"
	| "dead"

/**
 * Runtime information about a managed worker process.
 */
export interface WorkerInfo {
	/** Unique worker identifier. */
	readonly workerId: string

	/** The underlying child process. */
	readonly process: ChildProcess

	/** Current lifecycle state. */
	state: WorkerState

	/** Task currently being executed, if any. */
	currentTaskId: string | null

	/** Capabilities advertised by the worker. */
	capabilities: { moduleIds: string[]; maxConcurrent: number }

	/** When this worker was started. */
	readonly startedAt: number

	/** Timestamp of last heartbeat from this worker. */
	lastHeartbeatAt: number

	/** Number of tasks this worker has completed successfully. */
	tasksCompleted: number

	/** Recent crash timestamps (for quarantine detection). */
	crashTimestamps: number[]
}

// ── Pending task callback ───────────────────────────────────────────────

/**
 * Represents a task waiting to be assigned to a worker.
 */
interface PendingTask {
	task: Task
	executor: TaskExecutor
	assignedAt: number
}

// ── Worker Manager ──────────────────────────────────────────────────────

/**
 * Manages a pool of worker processes for isolated task execution.
 */
export class WorkerManager {
	private readonly options: Required<WorkerManagerOptions>
	private readonly events: EventBus
	private readonly logger: Logger
	private readonly workers = new Map<string, WorkerInfo>()
	private readonly transports = new Map<string, WorkerTransport>()
	private readonly pendingTasks = new Map<string, PendingTask>()
	private readonly metrics: WorkerMetrics
	private heartbeatTimer: ReturnType<typeof setInterval> | undefined
	private nextWorkerId = 1
	private shutdown = false

	constructor(
		events: EventBus,
		logger: Logger,
		options: WorkerManagerOptions = {},
	) {
		this.events = events
		this.logger = logger
		this.metrics = new WorkerMetrics()
		this.options = {
			poolSize: options.poolSize ?? 2,
			workerScriptPath: options.workerScriptPath ?? getDefaultWorkerScriptPath(),
			heartbeatCheckIntervalMs: options.heartbeatCheckIntervalMs ?? 10_000,
			heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 30_000,
			maxCrashesBeforeQuarantine: options.maxCrashesBeforeQuarantine ?? 3,
			quarantineWindowMs: options.quarantineWindowMs ?? 60_000,
			shutdownTimeoutMs: options.shutdownTimeoutMs ?? 5_000,
		}
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Start the worker manager and spawn the initial pool.
	 */
	start(): void {
		if (this.shutdown) {
			throw new Error("WorkerManager has been shut down and cannot be restarted.")
		}

		this.logger.info(`Starting WorkerManager with pool size ${this.options.poolSize}`)

		for (let i = 0; i < this.options.poolSize; i++) {
			this.spawnWorker()
		}

		this.startHeartbeatCheck()
		this.metrics.recordWorkerStarted()
	}

	/**
	 * Gracefully shut down all workers.
	 *
	 * 1. Stop accepting new tasks.
	 * 2. Send shutdown signal to all workers.
	 * 3. Wait up to shutdownTimeoutMs.
	 * 4. SIGKILL any remaining workers.
	 */
	async stop(): Promise<void> {
		this.shutdown = true
		this.stopHeartbeatCheck()

		this.logger.info("Shutting down WorkerManager...")

		// Fail any pending tasks.
		for (const [taskId] of this.pendingTasks) {
			this.failTask(taskId, {
				code: WORKER_ERROR_CODES.WORKER_CRASHED,
				message: "WorkerManager shutting down",
				recoverable: true,
			})
		}
		this.pendingTasks.clear()

		// Send shutdown to all alive workers.
		const shutdownPromises: Promise<void>[] = []
		for (const [workerId, transport] of this.transports) {
			if (transport.isAlive()) {
				const worker = this.workers.get(workerId)
				if (worker) {
					worker.state = "dead"
				}
				transport.close()
				if (worker && !worker.process.killed) {
					shutdownPromises.push(
						new Promise<void>((resolve) => {
							const timer = setTimeout(() => {
								if (!worker.process.killed) {
									worker.process.kill("SIGKILL")
								}
								resolve()
							}, this.options.shutdownTimeoutMs)

							worker.process.once("exit", () => {
								clearTimeout(timer)
								resolve()
							})
						}),
					)
				}
			}
		}

		await Promise.allSettled(shutdownPromises)

		this.transports.clear()
		this.workers.clear()
		this.metrics.recordWorkerStopped()

		this.logger.info("WorkerManager shut down complete.")
	}

	// ── Task assignment ──────────────────────────────────────────────────

	/**
	 * Assign a task to a ready worker for execution.
	 *
	 * If no worker is ready, the task is queued internally and will be
	 * assigned when a worker becomes available.
	 */
	assignTask(task: Task, executor: TaskExecutor): boolean {
		if (this.shutdown) return false

		const worker = this.getReadyWorker()
		if (!worker) {
			// Queue for later assignment.
			this.pendingTasks.set(task.id as string, {
				task,
				executor,
				assignedAt: Date.now(),
			})
			this.logger.debug(`Task ${task.id} queued — no ready workers available.`)
			return false
		}

		this.executeOnWorker(worker, task, executor)
		return true
	}

	/**
	 * Find an available (ready) worker.
	 *
	 * Returns the first ready worker, or undefined if none are available.
	 */
	private getReadyWorker(): WorkerInfo | undefined {
		for (const worker of this.workers.values()) {
			if (worker.state === "ready") {
				return worker
			}
		}
		return undefined
	}

	/**
	 * Get the number of ready (idle) workers.
	 */
	get readyCount(): number {
		let count = 0
		for (const worker of this.workers.values()) {
			if (worker.state === "ready") count++
		}
		return count
	}

	/**
	 * Get the number of busy workers.
	 */
	get busyCount(): number {
		let count = 0
		for (const worker of this.workers.values()) {
			if (worker.state === "busy") count++
		}
		return count
	}

	/**
	 * Get the total number of managed workers.
	 */
	get totalWorkers(): number {
		return this.workers.size
	}

	/**
	 * Get a snapshot of worker metrics.
	 */
	getMetrics(): ReturnType<WorkerMetrics["snapshot"]> {
		return this.metrics.snapshot()
	}

	// ── Message handling ─────────────────────────────────────────────────

	/**
	 * Process a message received from a worker.
	 */
	handleWorkerMessage(workerId: string, message: WorkerMessage): void {
		const worker = this.workers.get(workerId)
		if (!worker) return

		switch (message.type) {
			case "worker.hello":
				this.handleWorkerHello(worker, message)
				break

			case "worker.ready":
				this.handleWorkerReady(worker, message)
				break

			case "worker.heartbeat":
				this.handleWorkerHeartbeat(worker, message)
				break

			case "worker.shutdown":
				this.handleWorkerShutdown(worker, message)
				break

			case "task.progress":
				this.handleTaskProgress(worker, message)
				break

			case "task.result":
				this.handleTaskResult(worker, message)
				break

			case "task.failure":
				this.handleTaskFailure(worker, message)
				break

			default:
				break
		}
	}

	/**
	 * Handle a worker process exit (crash or normal).
	 */
	handleWorkerExit(workerId: string, code: number | null, signal: NodeJS.Signals | null): void {
		const worker = this.workers.get(workerId)
		if (!worker) return

		const wasBusy = worker.state === "busy"
		const taskId = worker.currentTaskId

		worker.state = "dead"
		this.metrics.recordWorkerCrash()

		// Record crash timestamp for quarantine detection.
		const now = Date.now()
		worker.crashTimestamps.push(now)

		this.logger.warn(
			`Worker ${workerId} exited (code=${code}, signal=${signal}). ` +
			`Was busy: ${wasBusy}, task: ${taskId ?? "none"}`,
		)

		// If the worker was executing a task, fail it.
		if (wasBusy && taskId) {
			this.failTask(taskId, {
				code: WORKER_ERROR_CODES.WORKER_CRASHED,
				message: `Worker ${workerId} crashed during task execution (code=${code}, signal=${signal})`,
				recoverable: true,
				details: { exitCode: code, signal },
			})
		}

		// Clean up transport.
		this.transports.delete(workerId)

		// Check quarantine: too many crashes in the window?
		const recentCrashes = worker.crashTimestamps.filter(
			(ts) => now - ts < this.options.quarantineWindowMs,
		)

		if (recentCrashes.length >= this.options.maxCrashesBeforeQuarantine) {
			this.logger.error(
				`Worker ${workerId} quarantined: ${recentCrashes.length} crashes in ${this.options.quarantineWindowMs}ms. ` +
				`Not respawning.`,
			)
			this.workers.delete(workerId)
			return
		}

		// Respawn a replacement worker (if not shutting down).
		if (!this.shutdown) {
			this.logger.info(`Respawning replacement for worker ${workerId}...`)
			this.spawnWorker()
		}

		this.workers.delete(workerId)
	}

	// ── Private: message handlers ────────────────────────────────────────

	private handleWorkerHello(worker: WorkerInfo, message: WorkerHelloMessage): void {
		worker.capabilities = message.capabilities
		worker.state = "ready"
		this.logger.info(
			`Worker ${worker.workerId} hello: capabilities=${JSON.stringify(message.capabilities)}`,
		)

		// Try to assign a pending task.
		this.tryAssignPendingTask(worker)
	}

	private handleWorkerReady(worker: WorkerInfo, _message: WorkerReadyMessage): void {
		worker.state = "ready"
		worker.currentTaskId = null
		this.logger.debug(`Worker ${worker.workerId} is ready.`)

		// Try to assign a pending task.
		this.tryAssignPendingTask(worker)
	}

	private handleWorkerHeartbeat(worker: WorkerInfo, _message: WorkerHeartbeatMessage): void {
		worker.lastHeartbeatAt = Date.now()

		// If it was unresponsive, mark it back to its previous state.
		if (worker.state === "unresponsive") {
			worker.state = worker.currentTaskId ? "busy" : "ready"
			this.logger.info(`Worker ${worker.workerId} is responsive again.`)
		}
	}

	private handleWorkerShutdown(worker: WorkerInfo, message: WorkerShutdownMessage): void {
		this.logger.info(
			`Worker ${worker.workerId} shutting down: ${message.reason ?? "no reason given"}`,
		)
		worker.state = "dead"
	}

	private handleTaskProgress(worker: WorkerInfo, message: TaskProgressMessage): void {
		// Forward progress to the event bus.
		this.events.emit("task.progress", {
			type: "task.progress",
			timestamp: new Date().toISOString(),
			source: "worker",
			taskId: message.taskId,
			progress: message.progress,
			message: message.message,
		})
	}

	private handleTaskResult(worker: WorkerInfo, message: TaskResultMessage): void {
		worker.state = "ready"
		worker.currentTaskId = null
		worker.tasksCompleted++
		this.metrics.recordTaskCompleted()

		// Resolve the pending task.
		const pending = this.pendingTasks.get(message.taskId)
		if (pending) {
			this.pendingTasks.delete(message.taskId)
		}

		// Emit task.completed event.
		this.events.emit("task.completed", {
			type: "task.completed",
			timestamp: new Date().toISOString(),
			source: "worker",
			taskId: message.taskId,
			summary: message.result.success ? "Task completed successfully" : "Task failed",
		})

		this.logger.debug(`Task ${message.taskId} completed on worker ${worker.workerId}.`)

		// Try to assign another pending task.
		this.tryAssignPendingTask(worker)
	}

	private handleTaskFailure(worker: WorkerInfo, message: TaskFailureMessage): void {
		worker.state = "ready"
		worker.currentTaskId = null
		this.metrics.recordTaskFailed()

		// Fail the task.
		this.failTask(message.taskId, {
			code: message.error.code,
			message: message.error.message,
			recoverable: true,
			details: message.error.details,
		})

		this.logger.debug(
			`Task ${message.taskId} failed on worker ${worker.workerId}: ${message.error.message}`,
		)

		// Try to assign another pending task.
		this.tryAssignPendingTask(worker)
	}

	// ── Private: task execution ───────────────────────────────────────────

	/**
	 * Execute a task on a specific worker.
	 */
	private executeOnWorker(worker: WorkerInfo, task: Task, executor: TaskExecutor): void {
		worker.state = "busy"
		worker.currentTaskId = task.id as string

		// Store the executor for callback resolution.
		this.pendingTasks.set(task.id as string, { task, executor, assignedAt: Date.now() })

		const transport = this.transports.get(worker.workerId)
		if (!transport) {
			this.logger.error(`No transport for worker ${worker.workerId}`)
			worker.state = "ready"
			worker.currentTaskId = null
			return
		}

		const payload: TaskPayload = {
			id: task.id as string,
			title: task.title,
			description: task.description,
			priority: task.priority,
			moduleId: task.moduleId,
			sessionId: task.sessionId,
			metadata: task.metadata,
		}

		const message: ExecuteTaskMessage = {
			id: crypto.randomUUID(),
			type: "execute.task",
			timestamp: new Date().toISOString(),
			task: payload,
			moduleId: task.moduleId,
		}

		transport.send(message).catch((error) => {
			this.logger.error(`Failed to send task ${task.id} to worker ${worker.workerId}:`, error)
			worker.state = "ready"
			worker.currentTaskId = null
		})

		this.logger.debug(`Task ${task.id} assigned to worker ${worker.workerId}.`)
	}

	/**
	 * Try to assign a pending task to a ready worker.
	 */
	private tryAssignPendingTask(worker: WorkerInfo): void {
		if (worker.state !== "ready") return

		// Find the oldest pending task.
		let oldestTaskId: string | null = null
		let oldestTime = Infinity

		for (const [taskId, entry] of this.pendingTasks) {
			if (entry.assignedAt < oldestTime) {
				oldestTime = entry.assignedAt
				oldestTaskId = taskId
			}
		}

		if (!oldestTaskId) return

		const pending = this.pendingTasks.get(oldestTaskId)
		if (!pending) return

		// Remove from pending — executeOnWorker will re-add it.
		this.pendingTasks.delete(oldestTaskId)
		this.executeOnWorker(worker, pending.task, pending.executor)
	}

	/**
	 * Fail a task with the given error.
	 *
	 * This is a callback-style interface — the actual TaskManager.fail()
	 * is called by the daemon after receiving the event.
	 *
	 * For now, we emit a task.failed event that the daemon listens to.
	 */
	private failTask(taskId: string, error: TaskError): void {
		this.pendingTasks.delete(taskId)

		this.events.emit("task.failed", {
			type: "task.failed",
			timestamp: new Date().toISOString(),
			source: "worker",
			taskId,
			error,
		})
	}

	// ── Private: worker lifecycle ────────────────────────────────────────

	/**
	 * Spawn a new worker process.
	 */
	private spawnWorker(): void {
		const workerId = `worker-${this.nextWorkerId++}`

		this.logger.info(`Spawning worker ${workerId}...`)

		const child = fork(this.options.workerScriptPath, [], {
			stdio: ["pipe", "pipe", "pipe", "ipc"],
			env: {
				...process.env,
				AIRI_WORKER_ID: workerId,
			},
		})

		const transport = new StdioWorkerTransport(child)

		// Set up message handler.
		transport.onMessage((message) => {
			this.handleWorkerMessage(workerId, message)
		})

		// Set up exit handler.
		child.on("exit", (code, signal) => {
			this.handleWorkerExit(workerId, code, signal)
		})

		// Set up error handler.
		child.on("error", (error) => {
			this.logger.error(`Worker ${workerId} process error:`, error.message)
		})

		// Log stderr for debugging.
		if (child.stderr) {
			child.stderr.on("data", (data: Buffer) => {
				this.logger.warn(`Worker ${workerId} stderr: ${data.toString("utf-8").trim()}`)
			})
		}

		const worker: WorkerInfo = {
			workerId,
			process: child,
			state: "starting",
			currentTaskId: null,
			capabilities: { moduleIds: [], maxConcurrent: 1 },
			startedAt: Date.now(),
			lastHeartbeatAt: Date.now(),
			tasksCompleted: 0,
			crashTimestamps: [],
		}

		this.workers.set(workerId, worker)
		this.transports.set(workerId, transport)
		this.metrics.recordWorkerStarted()
	}

	// ── Private: heartbeat ───────────────────────────────────────────────

	private startHeartbeatCheck(): void {
		this.stopHeartbeatCheck()
		this.heartbeatTimer = setInterval(() => {
			this.heartbeatCheck()
		}, this.options.heartbeatCheckIntervalMs)
	}

	private stopHeartbeatCheck(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer)
			this.heartbeatTimer = undefined
		}
	}

	/**
	 * Check all workers for heartbeat timeout.
	 */
	private heartbeatCheck(): void {
		const now = Date.now()

		for (const [workerId, worker] of this.workers) {
			if (worker.state === "dead") continue

			const elapsed = now - worker.lastHeartbeatAt

			if (elapsed > this.options.heartbeatTimeoutMs) {
				if (worker.state !== "unresponsive") {
					this.logger.warn(
						`Worker ${workerId} unresponsive (no heartbeat for ${elapsed}ms). Killing.`,
					)
					worker.state = "unresponsive"
				}

				// Kill the unresponsive worker.
				if (!worker.process.killed) {
					worker.process.kill("SIGKILL")
				}
			}
		}
	}
}

// ── Default worker script path ─────────────────────────────────────────

/**
 * Resolve the default path to the worker entry point.
 *
 * In production, this points to the compiled output of apps/worker.
 * Falls back to a path relative to the core package.
 */
function getDefaultWorkerScriptPath(): string {
	// The worker script is compiled from apps/worker/src/index.ts
	// and output to apps/worker/dist/index.js.
	return join(__dirname, "../../apps/worker/dist/index.js")
}
