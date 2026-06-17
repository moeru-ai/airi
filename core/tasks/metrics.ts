/**
 * AIRI Core — Runtime Diagnostics
 *
 * In-memory metrics tracking for the task orchestration layer.
 *
 * Tracks:
 * - Active/queued/completed/failed/cancelled task counts.
 * - Average execution duration.
 * - Per-module task counts.
 * - Uptime.
 */

import type { Task, TaskState } from "./types.js"

// ── Metrics snapshot ─────────────────────────────────────────────────────

/**
 * Snapshot of runtime metrics at a point in time.
 */
export interface TaskMetricsSnapshot {
	/** Number of currently running tasks. */
	readonly activeCount: number

	/** Number of queued tasks waiting for execution. */
	readonly queuedCount: number

	/** Total number of completed tasks. */
	readonly completedCount: number

	/** Total number of failed tasks. */
	readonly failedCount: number

	/** Total number of cancelled tasks. */
	readonly cancelledCount: number

	/** Average execution duration in milliseconds. */
	readonly averageExecutionMs: number

	/** Per-module task counts. */
	readonly perModule: Record<string, ModuleMetrics>

	/** Uptime in milliseconds. */
	readonly uptimeMs: number
}

/**
 * Per-module metrics.
 */
export interface ModuleMetrics {
	/** Number of active tasks for this module. */
	readonly active: number

	/** Number of queued tasks for this module. */
	readonly queued: number

	/** Total completed tasks for this module. */
	readonly completed: number

	/** Total failed tasks for this module. */
	readonly failed: number
}

// ── Metrics collector ────────────────────────────────────────────────────

/**
 * Collects and exposes runtime metrics for the task orchestration layer.
 *
 * All tracking is in-memory — no persistence.
 */
export class TaskMetrics {
	private startTime = Date.now()

	// Counters for completed/failed/cancelled (cumulative).
	private completedCount = 0
	private failedCount = 0
	private cancelledCount = 0

	// Execution duration tracking.
	private totalExecutionMs = 0
	private executionCount = 0

	// Per-module counters.
	private readonly moduleCounts = new Map<string, ModuleMetrics>()

	// ── Event handlers ──────────────────────────────────────────────────

	/**
	 * Record a task state transition.
	 *
	 * Call this whenever a task changes state.
	 */
	recordTransition(task: Task, previousState: TaskState, newState: TaskState): void {
		const moduleId = task.moduleId
		const moduleMetrics = this.getOrCreateModuleMetrics(moduleId)

		// Decrement previous state counter.
		const updatedPrevious = { ...moduleMetrics }
		switch (previousState) {
			case "running":
				updatedPrevious.active = Math.max(0, updatedPrevious.active - 1)
				break
			case "queued":
				updatedPrevious.queued = Math.max(0, updatedPrevious.queued - 1)
				break
			default:
				break
		}

		// Increment new state counter.
		const updatedNew = { ...updatedPrevious }
		switch (newState) {
			case "running":
				updatedNew.active++
				break
			case "queued":
				updatedNew.queued++
				break
			case "completed":
				updatedNew.completed++
				this.completedCount++
				if (task.startedAt && task.completedAt) {
					const duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
					this.totalExecutionMs += duration
					this.executionCount++
				}
				break
			case "failed":
				updatedNew.failed++
				this.failedCount++
				break
			case "cancelled":
				this.cancelledCount++
				break
			default:
				break
		}

		this.moduleCounts.set(moduleId, updatedNew)
	}

	// ── Snapshot ────────────────────────────────────────────────────────

	/**
	 * Get a snapshot of current metrics.
	 */
	snapshot(activeTasks: Task[], queuedTasks: Task[]): TaskMetricsSnapshot {
		const perModule: Record<string, ModuleMetrics> = {}

		for (const [moduleId, metrics] of this.moduleCounts) {
			perModule[moduleId] = { ...metrics }
		}

		// Ensure active/queued counts are accurate from live data.
		for (const task of activeTasks) {
			if (!perModule[task.moduleId]) {
				perModule[task.moduleId] = { active: 0, queued: 0, completed: 0, failed: 0 }
			}
		}
		for (const task of queuedTasks) {
			if (!perModule[task.moduleId]) {
				perModule[task.moduleId] = { active: 0, queued: 0, completed: 0, failed: 0 }
			}
		}

		return {
			activeCount: activeTasks.length,
			queuedCount: queuedTasks.length,
			completedCount: this.completedCount,
			failedCount: this.failedCount,
			cancelledCount: this.cancelledCount,
			averageExecutionMs: this.executionCount > 0
				? Math.round(this.totalExecutionMs / this.executionCount)
				: 0,
			perModule,
			uptimeMs: Date.now() - this.startTime,
		}
	}

	// ── Private ─────────────────────────────────────────────────────────

	private getOrCreateModuleMetrics(moduleId: string): ModuleMetrics {
		const existing = this.moduleCounts.get(moduleId)
		if (existing) return existing

		const fresh: ModuleMetrics = {
			active: 0,
			queued: 0,
			completed: 0,
			failed: 0,
		}
		this.moduleCounts.set(moduleId, fresh)
		return fresh
	}
}
