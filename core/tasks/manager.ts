/**
 * AIRI Core — Task Manager
 *
 * Owns the task lifecycle: creation, queuing, execution tracking, and cleanup.
 *
 * Design decisions:
 * - Class-based, not a global singleton. Instantiate per daemon.
 * - Bounded in-memory storage (configurable max, default 1000).
 * - Deterministic state transitions enforced via isValidTransition().
 * - Emits events on every state transition for IPC broadcast.
 * - Auto-removes completed tasks after TTL (configurable, default 5 minutes).
 */

import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type { Task, TaskState, TaskFilter, TaskResult, TaskError, CreateTaskInput } from "./types.js"
import { createTaskId, isValidTransition } from "./types.js"
import { createCancellationToken, CancellationTokenSource } from "./cancellation.js"
import type { CancellationToken } from "./cancellation.js"
import type { TaskExecutor } from "./executor.js"

// ── Configuration ────────────────────────────────────────────────────────

export interface TaskManagerOptions {
	/** Maximum number of tasks to retain in memory. @default 1000 */
	readonly maxTasks?: number

	/**
	 * TTL in milliseconds for completed/failed/cancelled tasks.
	 * After this duration, tasks are auto-removed. @default 300_000 (5 minutes)
	 */
	readonly completedTtlMs?: number

	/**
	 * Interval in milliseconds for the cleanup timer.
	 * @default 60_000 (1 minute)
	 */
	readonly cleanupIntervalMs?: number
}

// ── Internal task record ─────────────────────────────────────────────────

interface TaskRecord {
	task: Task
	source: CancellationTokenSource
}

// ── Task Manager ─────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle of tasks in the AIRI daemon.
 */
export class TaskManager {
	private readonly tasks = new Map<string, TaskRecord>()
	private readonly executors = new Map<string, TaskExecutor>()
	private readonly options: Required<TaskManagerOptions>
	private cleanupTimer: ReturnType<typeof setInterval> | undefined
	private readonly events: EventBus
	private readonly logger: Logger

	constructor(events: EventBus, logger: Logger, options: TaskManagerOptions = {}) {
		this.events = events
		this.logger = logger
		this.options = {
			maxTasks: options.maxTasks ?? 1000,
			completedTtlMs: options.completedTtlMs ?? 300_000,
			cleanupIntervalMs: options.cleanupIntervalMs ?? 60_000,
		}
	}

	start(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanupCompleted()
		}, this.options.cleanupIntervalMs)
	}

	stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer)
			this.cleanupTimer = undefined
		}
		for (const [id, record] of this.tasks) {
			if (record.task.state === "running" || record.task.state === "queued") {
				record.source.cancel("TaskManager stopped")
				this.transition(id, "cancelled", "TaskManager stopped")
			}
		}
	}

	registerExecutor(moduleId: string, executor: TaskExecutor): void {
		this.executors.set(moduleId, executor)
		this.logger.info(`TaskExecutor registered for module: ${moduleId}`)
	}

	unregisterExecutor(moduleId: string): void {
		this.executors.delete(moduleId)
	}

	findExecutor(task: Task): TaskExecutor | undefined {
		const moduleExecutor = this.executors.get(task.moduleId)
		if (moduleExecutor && moduleExecutor.canExecute(task)) {
			return moduleExecutor
		}
		for (const [, executor] of this.executors) {
			if (executor.canExecute(task)) {
				return executor
			}
		}
		return undefined
	}

	createTask(input: CreateTaskInput): Task {
		const id = createTaskId(crypto.randomUUID())
		const now = new Date().toISOString()
		const priority = input.priority ?? "normal"
		const moduleId = input.moduleId ?? "core"

		const task: Task = {
			id,
			title: input.title,
			description: input.description,
			state: "pending",
			priority,
			moduleId,
			sessionId: input.sessionId,
			createdAt: now,
			updatedAt: now,
			progress: 0,
			metadata: input.metadata ?? {},
			parentTaskId: input.parentTaskId,
			cancellation: { isCancelled: false },
		}

		const source = createCancellationToken()

		if (this.tasks.size >= this.options.maxTasks) {
			this.cleanupCompleted()
			if (this.tasks.size >= this.options.maxTasks) {
				throw new Error(`Task limit reached (${this.options.maxTasks}). Cannot create new task.`)
			}
		}

		this.tasks.set(id as string, { task, source })
		this.logger.info(`Task created: ${id} "${task.title}" [${task.moduleId}]`)

		return task
	}

	queue(taskId: string): Task | undefined {
		return this.transition(taskId, "queued")
	}

	start(taskId: string): Task | undefined {
		return this.transition(taskId, "running")
	}

	complete(taskId: string, result: TaskResult): Task | undefined {
		const task = this.transition(taskId, "completed")
		if (!task) return undefined

		const now = new Date().toISOString()
		const updated: Task = {
			...task,
			state: "completed",
			progress: 100,
			updatedAt: now,
			completedAt: now,
			result,
			cancellation: { isCancelled: false },
		}
		this.tasks.set(taskId, { ...this.tasks.get(taskId)!, task: updated })
		return updated
	}

	fail(taskId: string, error: TaskError): Task | undefined {
		const task = this.transition(taskId, "failed")
		if (!task) return undefined

		const now = new Date().toISOString()
		const updated: Task = {
			...task,
			state: "failed",
			updatedAt: now,
			completedAt: now,
			error,
			cancellation: { isCancelled: false },
		}
		this.tasks.set(taskId, { ...this.tasks.get(taskId)!, task: updated })
		return updated
	}

	cancel(taskId: string, reason?: string): Task | undefined {
		const record = this.tasks.get(taskId)
		if (!record) return undefined
		record.source.cancel(reason)
		return this.transition(taskId, "cancelled", reason)
	}

	private transition(taskId: string, newState: TaskState, message?: string): Task | undefined {
		const record = this.tasks.get(taskId)
		if (!record) return undefined

		const current = record.task

		if (!isValidTransition(current.state, newState)) {
			this.logger.warn(
				`Invalid transition for task ${taskId}: ${current.state} → ${newState}`,
			)
			return undefined
		}

		const now = new Date().toISOString()
		const updated: Task = {
			...current,
			state: newState,
			updatedAt: now,
			progressMessage: message ?? current.progressMessage,
			cancellation: newState === "cancelled"
				? { isCancelled: true, cancelledAt: now, reason: message }
				: current.cancellation,
			startedAt: newState === "running" ? now : current.startedAt,
			completedAt: newState === "completed" || newState === "failed" || newState === "cancelled"
				? now
				: current.completedAt,
		}

		this.tasks.set(taskId, { ...record, task: updated })
		this.logger.debug(`Task ${taskId}: ${current.state} → ${newState}`)

		return updated
	}

	reportProgress(taskId: string, progress: number, message?: string): void {
		const record = this.tasks.get(taskId)
		if (!record) return

		const clamped = Math.max(0, Math.min(100, progress))
		const now = new Date().toISOString()
		const updated: Task = {
			...record.task,
			progress: clamped,
			progressMessage: message ?? record.task.progressMessage,
			updatedAt: now,
		}
		this.tasks.set(taskId, { ...record, task: updated })
	}

	get(taskId: string): Task | undefined {
		return this.tasks.get(taskId)?.task
	}

	getCancellationToken(taskId: string): CancellationToken | undefined {
		return this.tasks.get(taskId)?.source.token
	}

	list(filter: TaskFilter = {}): Task[] {
		const results: Task[] = []
		for (const [, record] of this.tasks) {
			const task = record.task
			if (filter.state && task.state !== filter.state) continue
			if (filter.moduleId && task.moduleId !== filter.moduleId) continue
			if (filter.sessionId && task.sessionId !== filter.sessionId) continue
			if (filter.priority && task.priority !== filter.priority) continue
			if (filter.parentTaskId && task.parentTaskId !== filter.parentTaskId) continue
			results.push(task)
		}
		return results
	}

	getByState(state: TaskState): Task[] {
		return this.list({ state })
	}

	countByState(state: TaskState): number {
		let count = 0
		for (const [, record] of this.tasks) {
			if (record.task.state === state) count++
		}
		return count
	}

	get size(): number {
		return this.tasks.size
	}

	private cleanupCompleted(): void {
		const now = Date.now()
		const toRemove: string[] = []
		for (const [id, record] of this.tasks) {
			const { task } = record
			if (
				(task.state === "completed" || task.state === "failed" || task.state === "cancelled") &&
				task.completedAt
			) {
				const completedTime = new Date(task.completedAt).getTime()
				if (now - completedTime > this.options.completedTtlMs) {
					toRemove.push(id)
				}
			}
		}
		for (const id of toRemove) {
			this.tasks.delete(id)
		}
		if (toRemove.length > 0) {
			this.logger.debug(`Cleaned up ${toRemove.length} expired tasks`)
		}
	}
}
