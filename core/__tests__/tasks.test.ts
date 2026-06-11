/**
 * AIRI Core — Task Orchestration Tests
 *
 * Tests for the task orchestration layer: lifecycle, cancellation,
 * scheduler, replay buffer, metrics, and executor isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { EventBus } from "../events/bus.js"
import { createLogger } from "../logger.js"

// ── Imports under test ──────────────────────────────────────────────────

import {
	createTaskId,
	isValidTransition,
	VALID_TRANSITIONS,
	PRIORITY_WEIGHTS,
	type TaskId,
	type TaskState,
	type Task,
	type TaskResult,
	type TaskError,
} from "../tasks/types.js"

import {
	createCancellationToken,
	createLinkedCancellationToken,
	CancellationTokenSource,
	withTimeout,
} from "../tasks/cancellation.js"

import type { TaskExecutor, TaskExecutionContext } from "../tasks/executor.js"

import { TaskManager } from "../tasks/manager.js"
import type { TaskManagerOptions } from "../tasks/manager.js"

import { TaskScheduler } from "../tasks/scheduler.js"

import { TaskMetrics } from "../tasks/metrics.js"

import { TaskReplayBuffer } from "../tasks/replay-buffer.js"

// ── Test helpers ─────────────────────────────────────────────────────────

function createTestEventBus(): EventBus {
	return new EventBus()
}

function createTestLogger() {
	return createLogger("test")
}

function createMockExecutor(
	moduleId: string,
	executeFn: (task: Task, ctx: TaskExecutionContext) => Promise<TaskResult>,
): TaskExecutor {
	return {
		canExecute(task: Task) {
			return task.moduleId === moduleId
		},
		execute: executeFn,
	}
}

function createFastExecutor(moduleId: string, delayMs = 10): TaskExecutor {
	return createMockExecutor(moduleId, async (task, ctx) => {
		ctx.reportProgress(0, "starting")
		await new Promise((r) => setTimeout(r, delayMs))
		ctx.token.throwIfCancelled()
		ctx.reportProgress(100, "done")
		return { success: true, output: { taskId: task.id } }
	})
}

function createFailingExecutor(moduleId: string): TaskExecutor {
	return createMockExecutor(moduleId, async () => {
		throw new Error("Intentional failure")
	})
}

// ── Task types tests ────────────────────────────────────────────────────

describe("task types", () => {
	describe("createTaskId", () => {
		it("creates a branded TaskId from a raw string", () => {
			const id = createTaskId("abc-123")
			expect(id).toBe("abc-123")
		})

		it("generates unique IDs", () => {
			const ids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				ids.add(createTaskId(crypto.randomUUID()) as string)
			}
			expect(ids.size).toBe(100)
		})
	})

	describe("isValidTransition", () => {
		it("allows pending → queued", () => {
			expect(isValidTransition("pending", "queued")).toBe(true)
		})

		it("allows pending → cancelled", () => {
			expect(isValidTransition("pending", "cancelled")).toBe(true)
		})

		it("allows queued → running", () => {
			expect(isValidTransition("queued", "running")).toBe(true)
		})

		it("allows queued → cancelled", () => {
			expect(isValidTransition("queued", "cancelled")).toBe(true)
		})

		it("allows running → completed", () => {
			expect(isValidTransition("running", "completed")).toBe(true)
		})

		it("allows running → failed", () => {
			expect(isValidTransition("running", "failed")).toBe(true)
		})

		it("allows running → cancelled", () => {
			expect(isValidTransition("running", "cancelled")).toBe(true)
		})

		it("rejects completed → anything", () => {
			expect(isValidTransition("completed", "running")).toBe(false)
			expect(isValidTransition("completed", "pending")).toBe(false)
		})

		it("rejects failed → anything", () => {
			expect(isValidTransition("failed", "running")).toBe(false)
			expect(isValidTransition("failed", "pending")).toBe(false)
		})

		it("rejects cancelled → anything", () => {
			expect(isValidTransition("cancelled", "running")).toBe(false)
			expect(isValidTransition("cancelled", "pending")).toBe(false)
		})

		it("rejects pending → running (must go through queued)", () => {
			expect(isValidTransition("pending", "running")).toBe(false)
		})

		it("rejects pending → completed", () => {
			expect(isValidTransition("pending", "completed")).toBe(false)
		})
	})

	describe("PRIORITY_WEIGHTS", () => {
		it("orders priorities correctly", () => {
			expect(PRIORITY_WEIGHTS["low"]).toBeLessThan(PRIORITY_WEIGHTS["normal"])
			expect(PRIORITY_WEIGHTS["normal"]).toBeLessThan(PRIORITY_WEIGHTS["high"])
			expect(PRIORITY_WEIGHTS["high"]).toBeLessThan(PRIORITY_WEIGHTS["critical"])
		})
	})
})

// ── Cancellation tests ──────────────────────────────────────────────────

describe("CancellationToken", () => {
	describe("createCancellationToken", () => {
		it("creates a non-cancelled token", () => {
			const source = createCancellationToken()
			expect(source.isCancelled).toBe(false)
			expect(source.token.isCancelled).toBe(false)
		})
	})

	describe("cancel", () => {
		it("transitions to cancelled state", () => {
			const source = createCancellationToken()
			source.cancel()
			expect(source.isCancelled).toBe(true)
			expect(source.token.isCancelled).toBe(true)
		})

		it("is idempotent — double cancel does not throw", () => {
			const source = createCancellationToken()
			source.cancel()
			expect(() => source.cancel()).not.toThrow()
		})

		it("stores the cancellation reason", () => {
			const source = createCancellationToken()
			source.cancel("User requested")
			expect(() => source.token.throwIfCancelled()).toThrow("User requested")
		})
	})

	describe("onCancelled", () => {
		it("fires handler synchronously when already cancelled", () => {
			const source = createCancellationToken()
			source.cancel()

			let fired = false
			source.token.onCancelled(() => {
				fired = true
			})

			expect(fired).toBe(true)
		})

		it("fires handler on cancel", () => {
			const source = createCancellationToken()

			let fired = false
			let reason: string | undefined
			source.token.onCancelled((r) => {
				fired = true
				reason = r
			})

			expect(fired).toBe(false)
			source.cancel("test reason")
			expect(fired).toBe(true)
			expect(reason).toBe("test reason")
		})

		it("unsubscribe function removes the handler", () => {
			const source = createCancellationToken()

			let fired = false
			const unsub = source.token.onCancelled(() => {
				fired = true
			})

			unsub()
			source.cancel()
			expect(fired).toBe(false)
		})
	})

	describe("throwIfCancelled", () => {
		it("does nothing when not cancelled", () => {
			const source = createCancellationToken()
			expect(() => source.token.throwIfCancelled()).not.toThrow()
		})

		it("throws when cancelled", () => {
			const source = createCancellationToken()
			source.cancel()
			expect(() => source.token.throwIfCancelled()).toThrow("Task cancelled")
		})

		it("throws with reason when provided", () => {
			const source = createCancellationToken()
			source.cancel("User abort")
			expect(() => source.token.throwIfCancelled()).toThrow("User abort")
		})
	})

	describe("linked tokens", () => {
		it("child auto-cancels when parent cancels", () => {
			const parent = createCancellationToken()
			const child = createLinkedCancellationToken(parent.token)

			expect(child.isCancelled).toBe(false)
			parent.cancel("parent cancelled")
			expect(child.isCancelled).toBe(true)
		})

		it("child is immediately cancelled if parent already cancelled", () => {
			const parent = createCancellationToken()
			parent.cancel()

			const child = createLinkedCancellationToken(parent.token)
			expect(child.isCancelled).toBe(true)
		})
	})

	describe("withTimeout", () => {
		it("resolves when promise completes before timeout", async () => {
			const result = await withTimeout(
				Promise.resolve("done"),
				1000,
			)
			expect(result).toBe("done")
		})

		it("rejects when promise exceeds timeout", async () => {
			await expect(
				withTimeout(new Promise((r) => setTimeout(r, 200)), 50),
			).rejects.toThrow("timed out after 50ms")
		})

		it("rejects immediately if token already cancelled", async () => {
			const source = createCancellationToken()
			source.cancel()

			await expect(
				withTimeout(new Promise((r) => setTimeout(r, 1000)), 5000, source.token),
			).rejects.toThrow()
		})

		it("rejects when token cancels during wait", async () => {
			const source = createCancellationToken()

			// Cancel after 25ms.
			setTimeout(() => source.cancel(), 25)

			await expect(
				withTimeout(new Promise((r) => setTimeout(r, 200)), 5000, source.token),
			).rejects.toThrow("Task cancelled")
		})
	})
})

// ── TaskManager tests ──────────────────────────────────────────────────

describe("TaskManager", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let manager: TaskManager

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
		manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})
	})

	afterEach(() => {
		manager.stop()
	})

	describe("createTask", () => {
		it("creates a task in pending state", () => {
			const task = manager.createTask({ title: "Test task" })

			expect(task.state).toBe("pending")
			expect(task.title).toBe("Test task")
			expect(task.priority).toBe("normal")
			expect(task.moduleId).toBe("core")
			expect(task.progress).toBe(0)
		})

		it("generates unique IDs", () => {
			const t1 = manager.createTask({ title: "A" })
			const t2 = manager.createTask({ title: "B" })
			expect(t1.id).not.toBe(t2.id)
		})

		it("accepts optional parameters", () => {
			const task = manager.createTask({
				title: "Test",
				description: "A test task",
				priority: "high",
				moduleId: "code",
				metadata: { key: "value" },
			})

			expect(task.description).toBe("A test task")
			expect(task.priority).toBe("high")
			expect(task.moduleId).toBe("code")
			expect(task.metadata).toEqual({ key: "value" })
		})

		it("enforces max tasks limit", () => {
			const smallManager = new TaskManager(events, logger, { maxTasks: 2 })
			smallManager.createTask({ title: "A" })
			smallManager.createTask({ title: "B" })

			expect(() => smallManager.createTask({ title: "C" })).toThrow("Task limit reached")
			smallManager.stop()
		})
	})

	describe("state transitions", () => {
		it("transitions pending → queued → running → completed", () => {
			const task = manager.createTask({ title: "Lifecycle test" })

			const queued = manager.queue(task.id as string)
			expect(queued).toBeDefined()
			expect(queued!.state).toBe("queued")

			const running = manager.start(task.id as string)
			expect(running).toBeDefined()
			expect(running!.state).toBe("running")
			expect(running!.startedAt).toBeDefined()

			const completed = manager.complete(task.id as string, { success: true })
			expect(completed).toBeDefined()
			expect(completed!.state).toBe("completed")
			expect(completed!.progress).toBe(100)
			expect(completed!.completedAt).toBeDefined()
		})

		it("transitions running → failed", () => {
			const task = manager.createTask({ title: "Fail test" })
			manager.queue(task.id as string)
			manager.start(task.id as string)

			const failed = manager.fail(task.id as string, {
				code: "TEST_ERROR",
				message: "Test failure",
				recoverable: false,
			})

			expect(failed).toBeDefined()
			expect(failed!.state).toBe("failed")
			expect(failed!.error).toBeDefined()
			expect(failed!.error!.code).toBe("TEST_ERROR")
		})

		it("transitions pending → cancelled", () => {
			const task = manager.createTask({ title: "Cancel test" })

			const cancelled = manager.cancel(task.id as string, "No longer needed")
			expect(cancelled).toBeDefined()
			expect(cancelled!.state).toBe("cancelled")
			expect(cancelled!.cancellation.isCancelled).toBe(true)
			expect(cancelled!.cancellation.reason).toBe("No longer needed")
		})

		it("transitions queued → cancelled", () => {
			const task = manager.createTask({ title: "Cancel test" })
			manager.queue(task.id as string)

			const cancelled = manager.cancel(task.id as string)
			expect(cancelled).toBeDefined()
			expect(cancelled!.state).toBe("cancelled")
		})

		it("transitions running → cancelled", () => {
			const task = manager.createTask({ title: "Cancel test" })
			manager.queue(task.id as string)
			manager.start(task.id as string)

			const cancelled = manager.cancel(task.id as string)
			expect(cancelled).toBeDefined()
			expect(cancelled!.state).toBe("cancelled")
		})

		it("rejects invalid transitions", () => {
			const task = manager.createTask({ title: "Invalid transition" })

			// pending → running (must go through queued).
			const result = manager.start(task.id as string)
			expect(result).toBeUndefined()
		})

		it("rejects transitions from terminal states", () => {
			const task = manager.createTask({ title: "Terminal test" })
			manager.queue(task.id as string)
			manager.start(task.id as string)
			manager.complete(task.id as string, { success: true })

			// completed → running should fail.
			const result = manager.start(task.id as string)
			expect(result).toBeUndefined()
		})
	})

	describe("progress reporting", () => {
		it("updates progress and message", () => {
			const task = manager.createTask({ title: "Progress test" })

			manager.reportProgress(task.id as string, 50, "Halfway done")

			const updated = manager.get(task.id as string)
			expect(updated).toBeDefined()
			expect(updated!.progress).toBe(50)
			expect(updated!.progressMessage).toBe("Halfway done")
		})

		it("clamps progress to 0-100", () => {
			const task = manager.createTask({ title: "Clamp test" })

			manager.reportProgress(task.id as string, -10)
			expect(manager.get(task.id as string)!.progress).toBe(0)

			manager.reportProgress(task.id as string, 150)
			expect(manager.get(task.id as string)!.progress).toBe(100)
		})
	})

	describe("queries", () => {
		it("gets a task by ID", () => {
			const task = manager.createTask({ title: "Get test" })
			const found = manager.get(task.id as string)
			expect(found).toBeDefined()
			expect(found!.id).toBe(task.id)
		})

		it("returns undefined for unknown task", () => {
			expect(manager.get("nonexistent")).toBeUndefined()
		})

		it("lists all tasks", () => {
			manager.createTask({ title: "A" })
			manager.createTask({ title: "B" })
			manager.createTask({ title: "C" })

			const all = manager.list()
			expect(all).toHaveLength(3)
		})

		it("filters tasks by state", () => {
			manager.createTask({ title: "Pending" })
			const t2 = manager.createTask({ title: "To queue" })
			manager.queue(t2.id as string)

			const pending = manager.list({ state: "pending" })
			const queued = manager.list({ state: "queued" })

			expect(pending).toHaveLength(1)
			expect(pending[0].title).toBe("Pending")
			expect(queued).toHaveLength(1)
			expect(queued[0].title).toBe("To queue")
		})

		it("filters tasks by moduleId", () => {
			manager.createTask({ title: "Core task", moduleId: "core" })
			manager.createTask({ title: "Code task", moduleId: "code" })

			const codeTasks = manager.list({ moduleId: "code" })
			expect(codeTasks).toHaveLength(1)
			expect(codeTasks[0].title).toBe("Code task")
		})

		it("gets tasks by state", () => {
			manager.createTask({ title: "A" })
			manager.createTask({ title: "B" })

			const pending = manager.getByState("pending")
			expect(pending).toHaveLength(2)
		})

		it("counts tasks by state", () => {
			manager.createTask({ title: "A" })
			const t2 = manager.createTask({ title: "B" })
			manager.queue(t2.id as string)

			expect(manager.countByState("pending")).toBe(1)
			expect(manager.countByState("queued")).toBe(1)
		})
	})

	describe("executor registration", () => {
		it("registers and finds executors", () => {
			const executor = createFastExecutor("code")
			manager.registerExecutor("code", executor)

			const task = manager.createTask({ title: "Exec test", moduleId: "code" })
			const found = manager.findExecutor(task)

			expect(found).toBeDefined()
			expect(found).toBe(executor)
		})

		it("falls back to any capable executor", () => {
			const executor = createMockExecutor("code", async () => ({ success: true }))
			manager.registerExecutor("code", executor)

			// Task with different module — executor only accepts "code".
			const task = manager.createTask({ title: "Fallback", moduleId: "other" })
			const found = manager.findExecutor(task)
			expect(found).toBeUndefined()
		})

		it("unregisters executors", () => {
			const executor = createFastExecutor("code")
			manager.registerExecutor("code", executor)
			manager.unregisterExecutor("code")

			const task = manager.createTask({ title: "Exec test", moduleId: "code" })
			const found = manager.findExecutor(task)
			expect(found).toBeUndefined()
		})
	})

	describe("stop", () => {
		it("cancels all running and queued tasks", () => {
			const t1 = manager.createTask({ title: "Running" })
			manager.queue(t1.id as string)
			manager.start(t1.id as string)

			const t2 = manager.createTask({ title: "Queued" })
			manager.queue(t2.id as string)

			manager.stop()

			expect(manager.get(t1.id as string)!.state).toBe("cancelled")
			expect(manager.get(t2.id as string)!.state).toBe("cancelled")
		})
	})
})

// ── Scheduler tests ─────────────────────────────────────────────────────

describe("TaskScheduler", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let manager: TaskManager
	let scheduler: TaskScheduler

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
		manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})
		scheduler = new TaskScheduler(manager, events, logger, {
			concurrencyLimit: 2,
			tickIntervalMs: 10,
		})
	})

	afterEach(() => {
		scheduler.stop()
		manager.stop()
	})

	describe("priority ordering", () => {
		it("dispatches higher priority tasks first", async () => {
			const executionOrder: string[] = []

			const executor = createMockExecutor("code", async (task, ctx) => {
				executionOrder.push(task.priority)
				await new Promise((r) => setTimeout(r, 10))
				return { success: true }
			})

			manager.registerExecutor("code", executor)

			// Create tasks in reverse priority order.
			const low = manager.createTask({ title: "Low", priority: "low", moduleId: "code" })
			const critical = manager.createTask({ title: "Critical", priority: "critical", moduleId: "code" })
			const normal = manager.createTask({ title: "Normal", priority: "normal", moduleId: "code" })

			// Queue all.
			manager.queue(low.id as string)
			manager.queue(critical.id as string)
			manager.queue(normal.id as string)

			// Start scheduler and wait for tasks to complete.
			scheduler.start()
			await new Promise((r) => setTimeout(r, 200))
			scheduler.stop()

			// Critical should execute first.
			expect(executionOrder[0]).toBe("critical")
		})
	})

	describe("concurrency limits", () => {
		it("respects concurrency limit", async () => {
			let concurrentCount = 0
			let maxConcurrent = 0

			const executor = createMockExecutor("code", async (task, ctx) => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await new Promise((r) => setTimeout(r, 50))
				concurrentCount--
				return { success: true }
			})

			manager.registerExecutor("code", executor)

			// Create 5 tasks.
			for (let i = 0; i < 5; i++) {
				const task = manager.createTask({ title: `Task ${i}`, moduleId: "code" })
				manager.queue(task.id as string)
			}

			scheduler.start()
			await new Promise((r) => setTimeout(r, 300))
			scheduler.stop()

			// With concurrency limit of 2, max concurrent should be ≤ 2.
			expect(maxConcurrent).toBeLessThanOrEqual(2)
		})
	})

	describe("executor isolation", () => {
		it("one failing executor does not break others", async () => {
			const results: string[] = []

			// Register a failing executor for "bad" module.
			manager.registerExecutor("bad", createFailingExecutor("bad"))

			// Register a working executor for "code" module.
			manager.registerExecutor("code", createMockExecutor("code", async (task) => {
				results.push(task.title)
				await new Promise((r) => setTimeout(r, 10))
				return { success: true }
			}))

			// Create tasks for both modules.
			const badTask = manager.createTask({ title: "Bad", moduleId: "bad" })
			const goodTask = manager.createTask({ title: "Good", moduleId: "code" })

			manager.queue(badTask.id as string)
			manager.queue(goodTask.id as string)

			scheduler.start()
			await new Promise((r) => setTimeout(r, 200))
			scheduler.stop()

			// The good task should have completed despite the bad task failing.
			expect(results).toContain("Good")

			// The bad task should be in failed state.
			expect(manager.get(badTask.id as string)!.state).toBe("failed")
		})
	})
})

// ── Replay buffer tests ─────────────────────────────────────────────────

describe("TaskReplayBuffer", () => {
	let buffer: TaskReplayBuffer

	beforeEach(() => {
		buffer = new TaskReplayBuffer({ maxEvents: 10 })
	})

	describe("record and replay", () => {
		it("records task state transitions", () => {
			const task = {
				id: createTaskId("t1"),
				title: "Test",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			buffer.record(task, "pending", "queued")
			expect(buffer.size).toBe(1)
		})

		it("replays events since a timestamp", () => {
			const now = new Date()

			const task1 = {
				id: createTaskId("t1"),
				title: "Task 1",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			const task2 = {
				id: createTaskId("t2"),
				title: "Task 2",
				state: "running" as TaskState,
				moduleId: "code",
				priority: "high" as const,
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
				progress: 50,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			buffer.record(task1, "pending", "queued")
			buffer.record(task2, "queued", "running")

			const since = new Date(now.getTime() - 1000).toISOString()
			const events = buffer.getSince(since)

			expect(events).toHaveLength(2)
		})

		it("returns recent events", () => {
			const task = {
				id: createTaskId("t1"),
				title: "Test",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			for (let i = 0; i < 5; i++) {
				buffer.record(task, "pending", "queued")
			}

			const recent = buffer.getRecent(3)
			expect(recent).toHaveLength(3)
		})

		it("returns events for a specific task", () => {
			const task1 = {
				id: createTaskId("t1"),
				title: "Task 1",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			const task2 = {
				id: createTaskId("t2"),
				title: "Task 2",
				state: "running" as TaskState,
				moduleId: "code",
				priority: "high" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 50,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			buffer.record(task1, "pending", "queued")
			buffer.record(task2, "queued", "running")
			buffer.record(task1, "queued", "running")

			const t1Events = buffer.getForTask("t1")
			expect(t1Events).toHaveLength(2)
		})

		it("builds a snapshot of current task states", () => {
			const task1 = {
				id: createTaskId("t1"),
				title: "Task 1",
				state: "running" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 50,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			const task2 = {
				id: createTaskId("t2"),
				title: "Task 2",
				state: "completed" as TaskState,
				moduleId: "code",
				priority: "high" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 100,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			buffer.record(task1, "queued", "running")
			buffer.record(task2, "running", "completed")

			const snapshot = buffer.buildSnapshot()
			expect(snapshot.size).toBe(2)
			expect(snapshot.get("t1")!.state).toBe("running")
			expect(snapshot.get("t2")!.state).toBe("completed")
		})
	})

	describe("bounded buffer", () => {
		it("enforces max events limit", () => {
			const task = {
				id: createTaskId("t1"),
				title: "Test",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			for (let i = 0; i < 15; i++) {
				buffer.record(task, "pending", "queued")
			}

			// Max is 10, so only the last 10 should remain.
			expect(buffer.size).toBe(10)
		})

		it("clears all events", () => {
			const task = {
				id: createTaskId("t1"),
				title: "Test",
				state: "queued" as TaskState,
				moduleId: "code",
				priority: "normal" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 0,
				metadata: {},
				cancellation: { isCancelled: false },
				executionAttempt: 0,
				isolationLevel: "process" as const,
			}

			buffer.record(task, "pending", "queued")
			buffer.clear()
			expect(buffer.size).toBe(0)
		})
	})
})

// ── Metrics tests ───────────────────────────────────────────────────────

describe("TaskMetrics", () => {
	let metrics: TaskMetrics

	beforeEach(() => {
		metrics = new TaskMetrics()
	})

	it("tracks task completions", () => {
		const task = {
			id: createTaskId("t1"),
			title: "Test",
			state: "completed" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			startedAt: new Date(Date.now() - 100).toISOString(),
			completedAt: new Date().toISOString(),
			progress: 100,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		metrics.recordTransition(task, "running", "completed")

		const snapshot = metrics.snapshot([], [])
		expect(snapshot.completedCount).toBe(1)
		expect(snapshot.averageExecutionMs).toBeGreaterThan(0)
	})

	it("tracks task failures", () => {
		const task = {
			id: createTaskId("t1"),
			title: "Test",
			state: "failed" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			progress: 0,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		metrics.recordTransition(task, "running", "failed")

		const snapshot = metrics.snapshot([], [])
		expect(snapshot.failedCount).toBe(1)
	})

	it("tracks per-module metrics", () => {
		const task1 = {
			id: createTaskId("t1"),
			title: "Test 1",
			state: "completed" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			progress: 100,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		const task2 = {
			id: createTaskId("t2"),
			title: "Test 2",
			state: "failed" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			progress: 0,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		metrics.recordTransition(task1, "running", "completed")
		metrics.recordTransition(task2, "running", "failed")

		const snapshot = metrics.snapshot([], [])
		expect(snapshot.perModule["code"]).toBeDefined()
		expect(snapshot.perModule["code"].completed).toBe(1)
		expect(snapshot.perModule["code"].failed).toBe(1)
	})

	it("tracks active and queued counts from live data", () => {
		const activeTask = {
			id: createTaskId("t1"),
			title: "Active",
			state: "running" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			progress: 50,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		const queuedTask = {
			id: createTaskId("t2"),
			title: "Queued",
			state: "queued" as TaskState,
			moduleId: "code",
			priority: "normal" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			progress: 0,
			metadata: {},
			cancellation: { isCancelled: false },
			executionAttempt: 0,
			isolationLevel: "process" as const,
		}

		const snapshot = metrics.snapshot([activeTask], [queuedTask])
		expect(snapshot.activeCount).toBe(1)
		expect(snapshot.queuedCount).toBe(1)
	})

	it("tracks uptime", () => {
		const snapshot = metrics.snapshot([], [])
		expect(snapshot.uptimeMs).toBeGreaterThanOrEqual(0)
	})
})

// ── Integration: Task lifecycle with cancellation ───────────────────────

describe("task lifecycle with cancellation", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let manager: TaskManager

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
		manager = new TaskManager(events, logger)
	})

	afterEach(() => {
		manager.stop()
	})

	it("cancels a running task mid-execution", async () => {
		const executor = createMockExecutor("code", async (task, ctx) => {
			// Simulate long-running work.
			for (let i = 0; i < 10; i++) {
				await new Promise((r) => setTimeout(r, 10))
				ctx.token.throwIfCancelled()
				ctx.reportProgress(i * 10)
			}
			return { success: true }
		})

		manager.registerExecutor("code", executor)

		const task = manager.createTask({ title: "Cancellable", moduleId: "code" })
		manager.queue(task.id as string)
		manager.start(task.id as string)

		// Cancel after 25ms (mid-execution).
		setTimeout(() => {
			manager.cancel(task.id as string, "User cancelled")
		}, 25)

		// Wait for the executor to finish (it should throw on cancelled token).
		await new Promise((r) => setTimeout(r, 100))

		// The task should be cancelled.
		const final = manager.get(task.id as string)
		expect(final).toBeDefined()
		expect(final!.cancellation.isCancelled).toBe(true)
	})
})

// ── Integration: Full lifecycle with scheduler ──────────────────────────

describe("full lifecycle with scheduler", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let manager: TaskManager
	let scheduler: TaskScheduler

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
		manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})
		scheduler = new TaskScheduler(manager, events, logger, {
			concurrencyLimit: 4,
			tickIntervalMs: 10,
		})
	})

	afterEach(() => {
		scheduler.stop()
		manager.stop()
	})

	it("creates, queues, and completes a task end-to-end", async () => {
		const executor = createFastExecutor("code", 10)
		manager.registerExecutor("code", executor)

		// Create and queue a task.
		const task = manager.createTask({ title: "E2E test", moduleId: "code" })
		manager.queue(task.id as string)

		// Start scheduler.
		scheduler.start()

		// Wait for task to complete.
		await new Promise((r) => setTimeout(r, 200))

		// Verify task completed.
		const final = manager.get(task.id as string)
		expect(final).toBeDefined()
		expect(final!.state).toBe("completed")
		expect(final!.progress).toBe(100)
		expect(final!.result).toBeDefined()
		expect(final!.result!.success).toBe(true)
	})

	it("handles multiple tasks with priority ordering", async () => {
		const executionOrder: string[] = []

		const executor = createMockExecutor("code", async (task, ctx) => {
			executionOrder.push(task.title)
			await new Promise((r) => setTimeout(r, 10))
			return { success: true }
		})

		manager.registerExecutor("code", executor)

		// Create tasks with different priorities.
		const low = manager.createTask({ title: "Low", priority: "low", moduleId: "code" })
		const high = manager.createTask({ title: "High", priority: "high", moduleId: "code" })
		const critical = manager.createTask({ title: "Critical", priority: "critical", moduleId: "code" })

		// Queue in reverse order.
		manager.queue(low.id as string)
		manager.queue(high.id as string)
		manager.queue(critical.id as string)

		scheduler.start()
		await new Promise((r) => setTimeout(r, 200))
		scheduler.stop()

		// All tasks should complete.
		expect(manager.get(low.id as string)!.state).toBe("completed")
		expect(manager.get(high.id as string)!.state).toBe("completed")
		expect(manager.get(critical.id as string)!.state).toBe("completed")

		// Critical should execute first.
		expect(executionOrder[0]).toBe("Critical")
	})
})
