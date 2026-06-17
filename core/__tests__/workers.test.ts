/**
 * AIRI Core — Worker Runtime Tests
 *
 * Tests for the worker IPC protocol, transport, manager, and metrics.
 * Uses mocked ChildProcess to avoid spawning real subprocesses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"
import { Readable, Writable } from "node:stream"

// ── Mock child_process before importing modules that use it ─────────────

vi.mock("node:child_process", () => ({
	fork: vi.fn(() => {
		const proc = new EventEmitter() as unknown as Record<string, unknown>
		proc.stdin = new Writable({
			write(_chunk: unknown, _encoding: unknown, callback: () => void) {
				callback()
			},
		})
		proc.stdout = new Readable({
			read() { /* no-op mock */ },
		})
		proc.stderr = new Readable({
			read() { /* no-op mock */ },
		})
		proc.killed = false
		proc.exitCode = null
		proc.pid = 12345
		proc.kill = vi.fn((signal: string) => {
			proc.killed = true
			setTimeout(() => {
				proc.exitCode = signal === "SIGKILL" ? null : 0
				proc.emit("exit", signal === "SIGKILL" ? null : 0, signal)
			}, 10)
			return true
		})
		return proc
	}),
}))

// ── Imports (after mock) ────────────────────────────────────────────────

import { EventBus } from "../events/bus.js"
import { createLogger } from "../logger.js"

import {
	WORKER_ERROR_CODES,
	serializeWorkerMessage,
	deserializeWorkerMessage,
	type WorkerMessage,
	type WorkerHelloMessage,
	type WorkerReadyMessage,
	type ExecuteTaskMessage,
	type TaskProgressMessage,
	type TaskResultMessage,
	type TaskFailureMessage,
	type TaskPayload,
} from "../workers/protocol.js"

import { WorkerMetrics } from "../workers/metrics.js"
import { TaskManager } from "../tasks/manager.js"

// ── Test helpers ─────────────────────────────────────────────────────────

function createTestEventBus(): EventBus {
	return new EventBus()
}

function createTestLogger() {
	return createLogger("test")
}

/**
 * Encode a message as length-prefixed JSON (matching the transport format).
 */
function encodeMessage(msg: WorkerMessage): Buffer {
	const json = serializeWorkerMessage(msg)
	const payload = Buffer.from(json, "utf-8")
	const header = Buffer.alloc(4)
	header.writeUInt32BE(payload.length, 0)
	return Buffer.concat([header, payload])
}

// ── Protocol tests ──────────────────────────────────────────────────────

describe("WorkerProtocol", () => {
	describe("serialize/deserialize", () => {
		it("round-trips a WorkerHelloMessage", () => {
			const msg: WorkerHelloMessage = {
				id: "test-1",
				type: "worker.hello",
				timestamp: "2025-01-15T10:00:00.000Z",
				workerId: "worker-1",
				capabilities: { moduleIds: ["code"], maxConcurrent: 1 },
			}

			const serialized = serializeWorkerMessage(msg)
			const deserialized = deserializeWorkerMessage(serialized)

			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe("worker.hello")
			expect((deserialized as WorkerHelloMessage).workerId).toBe("worker-1")
			expect((deserialized as WorkerHelloMessage).capabilities.moduleIds).toEqual(["code"])
		})

		it("round-trips a WorkerReadyMessage", () => {
			const msg: WorkerReadyMessage = {
				id: "test-2",
				type: "worker.ready",
				timestamp: "2025-01-15T10:00:00.000Z",
				workerId: "worker-1",
			}

			const deserialized = deserializeWorkerMessage(serializeWorkerMessage(msg))
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe("worker.ready")
		})

		it("round-trips an ExecuteTaskMessage", () => {
			const task: TaskPayload = {
				id: "task-1",
				title: "Test task",
				description: "A test",
				priority: "normal",
				moduleId: "code",
				metadata: {},
			}

			const msg: ExecuteTaskMessage = {
				id: "test-3",
				type: "execute.task",
				timestamp: "2025-01-15T10:00:00.000Z",
				task,
				moduleId: "code",
			}

			const deserialized = deserializeWorkerMessage(serializeWorkerMessage(msg))
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe("execute.task")
			expect((deserialized as ExecuteTaskMessage).task.id).toBe("task-1")
			expect((deserialized as ExecuteTaskMessage).task.title).toBe("Test task")
		})

		it("round-trips a TaskResultMessage", () => {
			const msg: TaskResultMessage = {
				id: "test-4",
				type: "task.result",
				timestamp: "2025-01-15T10:00:00.000Z",
				workerId: "worker-1",
				taskId: "task-1",
				result: { success: true, output: { done: true } },
			}

			const deserialized = deserializeWorkerMessage(serializeWorkerMessage(msg))
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe("task.result")
			expect((deserialized as TaskResultMessage).result.success).toBe(true)
		})

		it("round-trips a TaskFailureMessage", () => {
			const msg: TaskFailureMessage = {
				id: "test-5",
				type: "task.failure",
				timestamp: "2025-01-15T10:00:00.000Z",
				workerId: "worker-1",
				taskId: "task-1",
				error: {
					code: WORKER_ERROR_CODES.WORKER_CRASHED,
					message: "Worker crashed",
				},
			}

			const deserialized = deserializeWorkerMessage(serializeWorkerMessage(msg))
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe("task.failure")
			expect((deserialized as TaskFailureMessage).error.code).toBe("WORKER_CRASHED")
		})

		it("returns null for invalid JSON", () => {
			expect(deserializeWorkerMessage("not json")).toBeNull()
		})

		it("returns null for valid JSON but invalid message shape", () => {
			expect(deserializeWorkerMessage('{"foo":"bar"}')).toBeNull()
		})

		it("returns null for unknown message type", () => {
			expect(deserializeWorkerMessage('{"id":"1","type":"unknown","timestamp":"2025-01-15T10:00:00.000Z"}')).toBeNull()
		})
	})

	describe("WORKER_ERROR_CODES", () => {
		it("contains expected error codes", () => {
			expect(WORKER_ERROR_CODES.WORKER_CRASHED).toBe("WORKER_CRASHED")
			expect(WORKER_ERROR_CODES.EXECUTOR_NOT_FOUND).toBe("EXECUTOR_NOT_FOUND")
			expect(WORKER_ERROR_CODES.TASK_TIMEOUT).toBe("TASK_TIMEOUT")
			expect(WORKER_ERROR_CODES.WORKER_INIT_FAILED).toBe("WORKER_INIT_FAILED")
			expect(WORKER_ERROR_CODES.EXECUTION_ERROR).toBe("EXECUTION_ERROR")
		})
	})
})

// ── WorkerMetrics tests ─────────────────────────────────────────────────

describe("WorkerMetrics", () => {
	let metrics: WorkerMetrics

	beforeEach(() => {
		metrics = new WorkerMetrics()
	})

	it("starts with zero values", () => {
		const snapshot = metrics.snapshot()
		expect(snapshot.totalWorkers).toBe(0)
		expect(snapshot.activeWorkers).toBe(0)
		expect(snapshot.tasksCompleted).toBe(0)
		expect(snapshot.tasksFailed).toBe(0)
		expect(snapshot.workerCrashes).toBe(0)
	})

	it("tracks worker lifecycle", () => {
		metrics.recordWorkerStarted()
		metrics.recordWorkerStarted()

		let snapshot = metrics.snapshot()
		expect(snapshot.totalWorkers).toBe(2)
		expect(snapshot.activeWorkers).toBe(2)

		metrics.recordWorkerStopped()
		snapshot = metrics.snapshot()
		expect(snapshot.activeWorkers).toBe(1)
	})

	it("tracks task completions and failures", () => {
		metrics.recordTaskCompleted()
		metrics.recordTaskCompleted()
		metrics.recordTaskFailed()

		const snapshot = metrics.snapshot()
		expect(snapshot.tasksCompleted).toBe(2)
		expect(snapshot.tasksFailed).toBe(1)
	})

	it("tracks worker crashes", () => {
		metrics.recordWorkerCrash()
		metrics.recordWorkerCrash()

		const snapshot = metrics.snapshot()
		expect(snapshot.workerCrashes).toBe(2)
	})

	it("includes startedAt timestamp", () => {
		const snapshot = metrics.snapshot()
		expect(snapshot.startedAt).toBeDefined()
		expect(typeof snapshot.startedAt).toBe("string")
		expect(new Date(snapshot.startedAt).toISOString()).toBe(snapshot.startedAt)
	})

	it("returns a consistent snapshot shape", () => {
		metrics.recordWorkerStarted()
		metrics.recordTaskCompleted()

		const snapshot = metrics.snapshot()
		expect(snapshot).toHaveProperty("totalWorkers")
		expect(snapshot).toHaveProperty("activeWorkers")
		expect(snapshot).toHaveProperty("idleWorkers")
		expect(snapshot).toHaveProperty("busyWorkers")
		expect(snapshot).toHaveProperty("tasksCompleted")
		expect(snapshot).toHaveProperty("tasksFailed")
		expect(snapshot).toHaveProperty("workerCrashes")
		expect(snapshot).toHaveProperty("averageWorkerUptimeMs")
		expect(snapshot).toHaveProperty("startedAt")
	})
})

// ── Task types: execution metadata tests ────────────────────────────────

describe("Task execution metadata", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
	})

	it("creates a task with default executionAttempt of 0", () => {
		const manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})

		const task = manager.createTask({ title: "Test" })
		expect(task.executionAttempt).toBe(0)
		expect(task.isolationLevel).toBe("process")
		expect(task.workerId).toBeUndefined()

		manager.stop()
	})

	it("creates a task with default isolationLevel of process", () => {
		const manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})

		const task = manager.createTask({ title: "Test", isolationLevel: "vm" })
		expect(task.isolationLevel).toBe("vm")

		manager.stop()
	})

	it("accepts isolationLevel in CreateTaskInput", () => {
		const manager = new TaskManager(events, logger, {
			maxTasks: 100,
			completedTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
		})

		const task = manager.createTask({
			title: "Container task",
			isolationLevel: "container",
		})
		expect(task.isolationLevel).toBe("container")

		manager.stop()
	})
})

// ── Protocol message sequencing tests ───────────────────────────────────

describe("Worker protocol message sequencing", () => {
	it("simulates a full worker lifecycle", () => {
		const messages: WorkerMessage[] = []

		const hello: WorkerHelloMessage = {
			id: "msg-1",
			type: "worker.hello",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
			capabilities: { moduleIds: ["code"], maxConcurrent: 1 },
		}
		messages.push(hello)

		const ready: WorkerReadyMessage = {
			id: "msg-2",
			type: "worker.ready",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
		}
		messages.push(ready)

		const execute: ExecuteTaskMessage = {
			id: "msg-3",
			type: "execute.task",
			timestamp: new Date().toISOString(),
			task: {
				id: "task-1",
				title: "Test task",
				priority: "normal",
				moduleId: "code",
				metadata: {},
			},
			moduleId: "code",
		}
		messages.push(execute)

		const progress: TaskProgressMessage = {
			id: "msg-4",
			type: "task.progress",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
			taskId: "task-1",
			progress: 50,
			message: "Halfway done",
		}
		messages.push(progress)

		const result: TaskResultMessage = {
			id: "msg-5",
			type: "task.result",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
			taskId: "task-1",
			result: { success: true, output: { done: true } },
		}
		messages.push(result)

		for (const msg of messages) {
			const serialized = serializeWorkerMessage(msg)
			const deserialized = deserializeWorkerMessage(serialized)
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe(msg.type)
		}
	})

	it("simulates a worker crash and failure message", () => {
		const messages: WorkerMessage[] = []

		messages.push({
			id: "msg-1",
			type: "worker.hello",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
			capabilities: { moduleIds: ["code"], maxConcurrent: 1 },
		})

		messages.push({
			id: "msg-2",
			type: "execute.task",
			timestamp: new Date().toISOString(),
			task: {
				id: "task-1",
				title: "Crash task",
				priority: "high",
				moduleId: "code",
				metadata: {},
			},
			moduleId: "code",
		})

		const failure: TaskFailureMessage = {
			id: "msg-3",
			type: "task.failure",
			timestamp: new Date().toISOString(),
			workerId: "worker-1",
			taskId: "task-1",
			error: {
				code: WORKER_ERROR_CODES.WORKER_CRASHED,
				message: "Worker crashed",
				details: { exitCode: null, signal: "SIGKILL" },
			},
		}
		messages.push(failure)

		for (const msg of messages) {
			const serialized = serializeWorkerMessage(msg)
			const deserialized = deserializeWorkerMessage(serialized)
			expect(deserialized).toBeDefined()
			expect(deserialized!.type).toBe(msg.type)
		}

		const lastMsg = deserializeWorkerMessage(serializeWorkerMessage(failure)) as TaskFailureMessage
		expect(lastMsg.error.code).toBe("WORKER_CRASHED")
		expect(lastMsg.error.details).toEqual({ exitCode: null, signal: "SIGKILL" })
	})
})

// ── Length-prefixed framing tests ───────────────────────────────────────

describe("Length-prefixed JSON framing", () => {
	it("correctly encodes and decodes a message", () => {
		const msg: WorkerReadyMessage = {
			id: "test-1",
			type: "worker.ready",
			timestamp: "2025-01-15T10:00:00.000Z",
			workerId: "worker-1",
		}

		const encoded = encodeMessage(msg)

		const payloadLength = encoded.readUInt32BE(0)
		expect(payloadLength).toBeGreaterThan(0)

		const jsonBytes = encoded.subarray(4)
		expect(jsonBytes.length).toBe(payloadLength)

		const json = jsonBytes.toString("utf-8")
		const parsed = JSON.parse(json)
		expect(parsed.type).toBe("worker.ready")
		expect(parsed.workerId).toBe("worker-1")
	})

	it("handles multiple messages in a single buffer", () => {
		const msg1: WorkerHelloMessage = {
			id: "msg-1",
			type: "worker.hello",
			timestamp: "2025-01-15T10:00:00.000Z",
			workerId: "worker-1",
			capabilities: { moduleIds: ["code"], maxConcurrent: 1 },
		}

		const msg2: WorkerReadyMessage = {
			id: "msg-2",
			type: "worker.ready",
			timestamp: "2025-01-15T10:00:01.000Z",
			workerId: "worker-1",
		}

		const combined = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2)])

		const len1 = combined.readUInt32BE(0)
		const json1 = combined.subarray(4, 4 + len1).toString("utf-8")
		const parsed1 = JSON.parse(json1)
		expect(parsed1.type).toBe("worker.hello")

		const offset2 = 4 + len1
		const len2 = combined.readUInt32BE(offset2)
		const json2 = combined.subarray(offset2 + 4, offset2 + 4 + len2).toString("utf-8")
		const parsed2 = JSON.parse(json2)
		expect(parsed2.type).toBe("worker.ready")
	})
})
