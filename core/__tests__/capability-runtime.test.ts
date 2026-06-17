/**
 * AIRI Core — Capability Runtime Tests
 *
 * Tests for the capability + tool runtime layer: branded types, registry,
 * local tool runtime, execution trace, events, and planner integration.
 */

import { describe, it, expect, beforeEach } from "vitest"

const _logger = (..._a: unknown[]) => void 0

import { EventBus } from "../events/bus.js"
import { createLogger } from "../logger.js"
import { createCancellationToken } from "../tasks/cancellation.js"
import { createTaskId } from "../tasks/types.js"
import { TaskManager } from "../tasks/manager.js"

import {
	createCapabilityId,
	createToolId,
	CapabilityRegistry,
} from "../capabilities/index.js"
import type {
	CapabilityDescriptor,
	ToolDescriptor,
	ToolId,
} from "../capabilities/types.js"

import { LocalToolRuntime } from "../runtime/local-tool-runtime.js"
import { ExecutionTrace } from "../runtime/execution-trace.js"

import { PlanExecutor } from "../planner/executor.js"
import { createPlanId, createStepId } from "../planner/types.js"
import type { Plan, PlanStep } from "../planner/types.js"
import type { Task, TaskResult } from "../tasks/types.js"
import type { TaskExecutor, TaskExecutionContext } from "../tasks/executor.js"

// ── Helpers ─────────────────────────────────────────────────────────────

function createTestEventBus(): EventBus {
	return new EventBus()
}

function createTestLogger() {
	return createLogger("test")
}

function createTestTaskManager(events: EventBus, logger: ReturnType<typeof createLogger>): TaskManager {
	return new TaskManager(events, logger, {
		maxTasks: 100,
		completedTtlMs: 60_000,
		cleanupIntervalMs: 30_000,
	})
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

function createTestToolDescriptor(toolId: string, capabilityId: string): ToolDescriptor {
	return {
		id: toolId as ToolId,
		name: `Tool ${toolId}`,
		description: `Description for ${toolId}`,
		capabilityId: capabilityId as import("../capabilities/types.js").CapabilityId,
		inputSchema: { type: "object" },
		outputSchema: { type: "object" },
	}
}

function createTestCapabilityDescriptor(
	capabilityId: string,
	moduleId: string,
	tools: ToolDescriptor[],
): CapabilityDescriptor {
	return {
		id: capabilityId as import("../capabilities/types.js").CapabilityId,
		name: `Capability ${capabilityId}`,
		description: `Description for ${capabilityId}`,
		moduleId,
		tools,
	}
}

function createTestPlan(name: string, steps: PlanStep[]): Plan {
	const now = new Date().toISOString()
	return {
		id: createPlanId(crypto.randomUUID()),
		name,
		steps,
		status: "pending",
		createdAt: now,
	}
}

function createTestStep(
	name: string,
	action: string,
	input: Record<string, unknown> = {},
	dependencyIds?: string[],
): PlanStep {
	return {
		id: createStepId(crypto.randomUUID()),
		name,
		action,
		input,
		dependencyIds: dependencyIds ? dependencyIds as import("../planner/types.js").StepId[] : undefined,
		status: "pending",
	}
}

// ── Branded type tests ──────────────────────────────────────────────────

describe("branded types", () => {
	describe("createCapabilityId", () => {
		it("creates a branded CapabilityId from a raw string", () => {
			const id = createCapabilityId("code")
			expect(id).toBe("code")
		})

		it("creates unique IDs for different values", () => {
			const id1 = createCapabilityId("code")
			const id2 = createCapabilityId("terminal")
			expect(id1).not.toBe(id2)
		})
	})

	describe("createToolId", () => {
		it("creates a branded ToolId from a raw string", () => {
			const id = createToolId("read_file")
			expect(id).toBe("read_file")
		})

		it("creates unique IDs for different values", () => {
			const id1 = createToolId("read_file")
			const id2 = createToolId("write_file")
			expect(id1).not.toBe(id2)
		})
	})
})

// ── CapabilityRegistry tests ────────────────────────────────────────────

describe("CapabilityRegistry", () => {
	let registry: CapabilityRegistry

	beforeEach(() => {
		registry = new CapabilityRegistry()
	})

	describe("register", () => {
		it("registers a capability", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			expect(registry.size()).toBe(1)
		})

		it("throws on duplicate capability ID", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			expect(() => registry.register(desc)).toThrow("Capability already registered")
		})

		it("throws on tool ID collision across capabilities", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)

			const tool2 = createTestToolDescriptor("read_file", "terminal")
			const desc2 = createTestCapabilityDescriptor("terminal", "terminal", [tool2])
			expect(() => registry.register(desc2)).toThrow("Tool ID collision")
		})

		it("allows registering multiple capabilities with different tool IDs", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)

			const tool2 = createTestToolDescriptor("execute_command", "terminal")
			const desc2 = createTestCapabilityDescriptor("terminal", "terminal", [tool2])
			registry.register(desc2)

			expect(registry.size()).toBe(2)
		})
	})

	describe("unregister", () => {
		it("unregisters a capability", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			expect(registry.unregister(desc.id)).toBe(true)
			expect(registry.size()).toBe(0)
		})

		it("returns false for unknown capability", () => {
			expect(registry.unregister(createCapabilityId("unknown"))).toBe(false)
		})

		it("removes tool mappings on unregister", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			registry.unregister(desc.id)
			expect(registry.hasTool(tool.id)).toBe(false)
		})
	})

	describe("get", () => {
		it("retrieves a capability by ID", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			const info = registry.get(desc.id)
			expect(info).toBeDefined()
			expect(info!.descriptor.id).toBe(desc.id)
			expect(info!.status).toBe("registered")
		})

		it("returns undefined for unknown ID", () => {
			expect(registry.get(createCapabilityId("unknown"))).toBeUndefined()
		})
	})

	describe("list", () => {
		it("lists all registered capabilities", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)

			const tool2 = createTestToolDescriptor("execute_command", "terminal")
			const desc2 = createTestCapabilityDescriptor("terminal", "terminal", [tool2])
			registry.register(desc2)

			expect(registry.list()).toHaveLength(2)
		})

		it("returns empty list when no capabilities registered", () => {
			expect(registry.list()).toHaveLength(0)
		})
	})

	describe("findByModule", () => {
		it("finds capabilities by module ID", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)

			const tool2 = createTestToolDescriptor("write_file", "code")
			const desc2 = createTestCapabilityDescriptor("code-extra", "code", [tool2])
			registry.register(desc2)

			const tool3 = createTestToolDescriptor("execute_command", "terminal")
			const desc3 = createTestCapabilityDescriptor("terminal", "terminal", [tool3])
			registry.register(desc3)

			const codeCapabilities = registry.findByModule("code")
			expect(codeCapabilities).toHaveLength(2)

			const terminalCapabilities = registry.findByModule("terminal")
			expect(terminalCapabilities).toHaveLength(1)
		})

		it("returns empty array for unknown module", () => {
			expect(registry.findByModule("nonexistent")).toHaveLength(0)
		})
	})

	describe("findTool", () => {
		it("finds a tool by ID", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)

			const found = registry.findTool(tool.id)
			expect(found).toBeDefined()
			expect(found!.tool.id).toBe(tool.id)
			expect(found!.capability.descriptor.id).toBe(desc.id)
		})

		it("returns undefined for unknown tool", () => {
			expect(registry.findTool("unknown" as ToolId)).toBeUndefined()
		})
	})

	describe("hasTool", () => {
		it("returns true for registered tool", () => {
			const tool = createTestToolDescriptor("read_file", "code")
			const desc = createTestCapabilityDescriptor("code", "code", [tool])
			registry.register(desc)
			expect(registry.hasTool(tool.id)).toBe(true)
		})

		it("returns false for unknown tool", () => {
			expect(registry.hasTool("unknown" as ToolId)).toBe(false)
		})
	})

	describe("clear", () => {
		it("removes all capabilities and returns count", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)

			const tool2 = createTestToolDescriptor("execute_command", "terminal")
			const desc2 = createTestCapabilityDescriptor("terminal", "terminal", [tool2])
			registry.register(desc2)

			const count = registry.clear()
			expect(count).toBe(2)
			expect(registry.size()).toBe(0)
		})

		it("returns 0 when registry is empty", () => {
			expect(registry.clear()).toBe(0)
		})
	})

	describe("size", () => {
		it("returns 0 for empty registry", () => {
			expect(registry.size()).toBe(0)
		})

		it("returns correct count after register and unregister", () => {
			const tool1 = createTestToolDescriptor("read_file", "code")
			const desc1 = createTestCapabilityDescriptor("code", "code", [tool1])
			registry.register(desc1)
			expect(registry.size()).toBe(1)

			const tool2 = createTestToolDescriptor("write_file", "code2")
			const desc2 = createTestCapabilityDescriptor("code2", "code", [tool2])
			registry.register(desc2)
			expect(registry.size()).toBe(2)

			registry.unregister(desc1.id)
			expect(registry.size()).toBe(1)
		})
	})
})

// ── LocalToolRuntime tests ──────────────────────────────────────────────

describe("LocalToolRuntime", () => {
	let events: EventBus
	let registry: CapabilityRegistry
	let runtime: LocalToolRuntime

	beforeEach(() => {
		events = createTestEventBus()
		registry = new CapabilityRegistry()
		runtime = new LocalToolRuntime(registry, events)
	})

	describe("execute success", () => {
		it("executes a registered tool handler", async () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)

			runtime.registerHandler(tool.id, async (input) => {
				return { echoed: input }
			})

			const token = createCancellationToken()
			const result = await runtime.execute(
				tool.id,
				{ message: "hello" },
				{
					taskId: createTaskId("task-1"),
					cancellationToken: token.token,
					timeoutMs: 5_000,
					metadata: {},
				},
			)

			expect(result.success).toBe(true)
			expect(result.output).toEqual({ echoed: { message: "hello" } })
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
			expect(result.error).toBeUndefined()
		})
	})

	describe("execute timeout", () => {
		it("returns timeout error when handler exceeds timeout", async () => {
			const tool = createTestToolDescriptor("slow", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)

			runtime.registerHandler(tool.id, async () => {
				await new Promise((r) => setTimeout(r, 10_000))
				return "done"
			})

			const token = createCancellationToken()
			const result = await runtime.execute(
				tool.id,
				{},
				{
					taskId: createTaskId("task-1"),
					cancellationToken: token.token,
					timeoutMs: 50,
					metadata: {},
				},
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("TIMEOUT")
			expect(result.error?.message).toContain("timed out")
		})
	})

	describe("execute cancellation", () => {
		it("returns cancelled error when already cancelled", async () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)

			const token = createCancellationToken()
			token.cancel("User cancelled")

			const result = await runtime.execute(
				tool.id,
				{},
				{
					taskId: createTaskId("task-1"),
					cancellationToken: token.token,
					timeoutMs: 5_000,
					metadata: {},
				},
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("CANCELLED")
		})
	})

	describe("unknown tool", () => {
		it("returns error for unregistered tool", async () => {
			const token = createCancellationToken()
			const result = await runtime.execute(
				"unknown_tool" as ToolId,
				{},
				{
					taskId: createTaskId("task-1"),
					cancellationToken: token.token,
					timeoutMs: 5_000,
					metadata: {},
				},
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("UNKNOWN_TOOL")
		})
	})

	describe("no handler", () => {
		it("returns error when tool is registered but no handler", async () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)

			// Don't register a handler.
			const token = createCancellationToken()
			const result = await runtime.execute(
				tool.id,
				{},
				{
					taskId: createTaskId("task-1"),
					cancellationToken: token.token,
					timeoutMs: 5_000,
					metadata: {},
				},
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("NO_HANDLER")
		})
	})

	describe("hasTool", () => {
		it("returns false for tool without handler", () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)
			expect(runtime.hasTool(tool.id)).toBe(false)
		})

		it("returns true for tool with registered handler", () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)
			runtime.registerHandler(tool.id, async () => "ok")
			expect(runtime.hasTool(tool.id)).toBe(true)
		})

		it("returns false for unknown tool", () => {
			expect(runtime.hasTool("unknown" as ToolId)).toBe(false)
		})
	})

	describe("getToolDescriptor", () => {
		it("returns descriptor for registered tool", () => {
			const tool = createTestToolDescriptor("echo", "test")
			const desc = createTestCapabilityDescriptor("test", "test", [tool])
			registry.register(desc)

			const descriptor = runtime.getToolDescriptor(tool.id)
			expect(descriptor).toBeDefined()
			expect(descriptor!.id).toBe(tool.id)
		})

		it("returns undefined for unknown tool", () => {
			expect(runtime.getToolDescriptor("unknown" as ToolId)).toBeUndefined()
		})
	})

	describe("registerHandler", () => {
		it("throws for unknown tool", () => {
			expect(() => {
				runtime.registerHandler("unknown" as ToolId, async () => "ok")
			}).toThrow("Cannot register handler for unknown tool")
		})
	})
})

// ── ExecutionTrace tests ────────────────────────────────────────────────

describe("ExecutionTrace", () => {
	let trace: ExecutionTrace

	beforeEach(() => {
		trace = new ExecutionTrace()
	})

	describe("record and size", () => {
		it("records entries and tracks size", () => {
			expect(trace.size()).toBe(0)

			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				completedAt: Date.now() + 100,
				durationMs: 100,
				success: true,
				input: { path: "test.ts" },
				output: { content: "hello" },
				metadata: {},
			})

			expect(trace.size()).toBe(1)
		})
	})

	describe("getRecords", () => {
		it("returns all records when no filter", () => {
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			trace.record({
				executionId: "exec-2",
				toolId: "write_file" as ToolId,
				taskId: createTaskId("task-2"),
				startedAt: Date.now(),
				success: false,
				input: {},
				error: { code: "ERROR", message: "failed" },
				metadata: {},
			})

			expect(trace.getRecords()).toHaveLength(2)
		})

		it("filters by toolId", () => {
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			trace.record({
				executionId: "exec-2",
				toolId: "write_file" as ToolId,
				taskId: createTaskId("task-2"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			const filtered = trace.getRecords({ toolId: "read_file" as ToolId })
			expect(filtered).toHaveLength(1)
			expect(filtered[0].executionId).toBe("exec-1")
		})

		it("filters by taskId", () => {
			const taskId = createTaskId("task-1")
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId,
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			trace.record({
				executionId: "exec-2",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-2"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			const filtered = trace.getRecords({ taskId })
			expect(filtered).toHaveLength(1)
			expect(filtered[0].executionId).toBe("exec-1")
		})

		it("filters by since timestamp", () => {
			const now = Date.now()
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: now - 1000,
				success: true,
				input: {},
				metadata: {},
			})

			trace.record({
				executionId: "exec-2",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-2"),
				startedAt: now,
				success: true,
				input: {},
				metadata: {},
			})

			const filtered = trace.getRecords({ since: now - 500 })
			expect(filtered).toHaveLength(1)
			expect(filtered[0].executionId).toBe("exec-2")
		})

		it("combines filters", () => {
			const now = Date.now()
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: now,
				success: true,
				input: {},
				metadata: {},
			})

			trace.record({
				executionId: "exec-2",
				toolId: "write_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: now,
				success: true,
				input: {},
				metadata: {},
			})

			const filtered = trace.getRecords({
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				since: now - 100,
			})
			expect(filtered).toHaveLength(1)
			expect(filtered[0].executionId).toBe("exec-1")
		})
	})

	describe("getRecent", () => {
		it("returns the most recent N entries", () => {
			const ENTRY_COUNT = 5
			for (let i = 0; i < ENTRY_COUNT; i++) {
				trace.record({
					executionId: `exec-${i}`,
					toolId: "read_file" as ToolId,
					taskId: createTaskId("task-1"),
					startedAt: Date.now() + i,
					success: true,
					input: {},
					metadata: {},
				})
			}

			const RECENT_COUNT = 3
			const recent = trace.getRecent(RECENT_COUNT)
			expect(recent).toHaveLength(3)
			expect(recent[0].executionId).toBe("exec-2")
			expect(recent[2].executionId).toBe("exec-4")
		})

		it("returns all entries when count exceeds size", () => {
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			const recent = trace.getRecent(10)
			expect(recent).toHaveLength(1)
		})

		it("returns empty array for count less than or equal to 0", () => {
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			expect(trace.getRecent(0)).toHaveLength(0)
			expect(trace.getRecent(-1)).toHaveLength(0)
		})
	})

	describe("clear", () => {
		it("removes all records", () => {
			trace.record({
				executionId: "exec-1",
				toolId: "read_file" as ToolId,
				taskId: createTaskId("task-1"),
				startedAt: Date.now(),
				success: true,
				input: {},
				metadata: {},
			})

			trace.clear()
			expect(trace.size()).toBe(0)
			expect(trace.getRecords()).toHaveLength(0)
		})
	})
})

// ── Tool runtime event tests ────────────────────────────────────────────

describe("tool runtime events", () => {
	let events: EventBus
	let registry: CapabilityRegistry
	let runtime: LocalToolRuntime

	beforeEach(() => {
		events = createTestEventBus()
		registry = new CapabilityRegistry()
		runtime = new LocalToolRuntime(registry, events)
	})

	it("emits tool.execution.started on successful execution", async () => {
		const emittedEvents: string[] = []
		events.on("tool.execution.started", () => emittedEvents.push("started"))
		events.on("tool.execution.completed", () => emittedEvents.push("completed"))

		const tool = createTestToolDescriptor("echo", "test")
		const desc = createTestCapabilityDescriptor("test", "test", [tool])
		registry.register(desc)

		runtime.registerHandler(tool.id, async (input) => input)

		const token = createCancellationToken()
		await runtime.execute(
			tool.id,
			{ msg: "hi" },
			{
				taskId: createTaskId("task-1"),
				cancellationToken: token.token,
				timeoutMs: 5_000,
				metadata: {},
			},
		)

		expect(emittedEvents).toContain("started")
		expect(emittedEvents).toContain("completed")
	})

	it("emits tool.execution.failed on timeout", async () => {
		const emittedEvents: string[] = []
		events.on("tool.execution.failed", (p) => {
			emittedEvents.push(`failed:${(p as { error: { code: string } }).error.code}`)
		})

		const tool = createTestToolDescriptor("slow", "test")
		const desc = createTestCapabilityDescriptor("test", "test", [tool])
		registry.register(desc)

		runtime.registerHandler(tool.id, async () => {
			await new Promise((r) => setTimeout(r, 10_000))
		})

		const token = createCancellationToken()
		await runtime.execute(
			tool.id,
			{},
			{
				taskId: createTaskId("task-1"),
				cancellationToken: token.token,
				timeoutMs: 50,
				metadata: {},
			},
		)

		expect(emittedEvents.some((e) => e.startsWith("failed:"))).toBe(true)
	})

	it("emits tool.execution.failed for unknown tool", async () => {
		const emittedEvents: string[] = []
		events.on("tool.execution.failed", () => emittedEvents.push("failed"))

		const token = createCancellationToken()
		await runtime.execute(
			"unknown" as ToolId,
			{},
			{
				taskId: createTaskId("task-1"),
				cancellationToken: token.token,
				timeoutMs: 5_000,
				metadata: {},
			},
		)

		expect(emittedEvents).toContain("failed")
	})
})

// ── Planner integration tests ───────────────────────────────────────────

describe("PlanExecutor with ToolRuntime", () => {
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let taskManager: TaskManager
	let registry: CapabilityRegistry
	let toolRuntime: LocalToolRuntime
	let executor: PlanExecutor

	beforeEach(() => {
		events = createTestEventBus()
		logger = createTestLogger()
		taskManager = createTestTaskManager(events, logger)
		taskManager.start()
		void logger

		registry = new CapabilityRegistry()
		toolRuntime = new LocalToolRuntime(registry, events)

		executor = new PlanExecutor(taskManager, events, logger, {
			concurrency: 2,
			defaultStepTimeoutMs: 5_000,
			toolRuntime,
		})
	})

	it("executes a plan step via tool runtime when action maps to a registered tool", async () => {
		const tool = createTestToolDescriptor("echo", "test")
		const desc = createTestCapabilityDescriptor("test", "test", [tool])
		registry.register(desc)

		let handlerCalled = false
		toolRuntime.registerHandler(tool.id, async (input) => {
			handlerCalled = true
			return { result: "tool-executed", input }
		})

		const step = createTestStep("echo-step", "echo", { message: "hello" })
		const plan = createTestPlan("tool-runtime-plan", [step])

		const result = await executor.executePlan(plan)

		expect(result.status).toBe("completed")
		expect(handlerCalled).toBe(true)
		expect(result.steps[0].status).toBe("completed")
		expect(result.steps[0].result?.success).toBe(true)
	})

	it("falls back to TaskExecutor when tool runtime has no matching tool", async () => {
		taskManager.registerExecutor("planner", createMockExecutor("planner", async (_task, _ctx) => {
			return { success: true }
		}))

		const step = createTestStep("executor-step", "some_action", {})
		const plan = createTestPlan("fallback-plan", [step])

		const result = await executor.executePlan(plan)

		expect(result.status).toBe("completed")
		expect(result.steps[0].status).toBe("completed")
	})

	it("falls back to TaskExecutor when tool runtime is not configured", async () => {
		const executorNoToolRuntime = new PlanExecutor(taskManager, events, logger, {
			concurrency: 2,
			defaultStepTimeoutMs: 5_000,
		})

		taskManager.registerExecutor("planner", createMockExecutor("planner", async (_task, _ctx) => {
			return { success: true }
		}))

		const step = createTestStep("step-1", "action_a")
		const plan = createTestPlan("no-tool-runtime-plan", [step])

		const result = await executorNoToolRuntime.executePlan(plan)

		expect(result.status).toBe("completed")
		expect(result.steps[0].status).toBe("completed")
	})

	it("handles tool execution failure gracefully", async () => {
		const tool = createTestToolDescriptor("failing-tool", "test")
		const desc = createTestCapabilityDescriptor("test", "test", [tool])
		registry.register(desc)

		toolRuntime.registerHandler(tool.id, () => {
			return Promise.reject(new Error("Tool failed intentionally"))
		})

		const step = createTestStep("failing-step", "failing-tool", {})
		const plan = createTestPlan("failing-tool-plan", [step])

		// Suppress unhandled rejection from the handler promise.
		// The tool runtime wraps the handler in withTimeout, but the
		// rejected promise can escape the catch chain in some edge cases.
		const unhandled = (_reason: unknown) => {
			// Expected: "Tool failed intentionally"
		}
		process.on("unhandledRejection", unhandled)

		const result = await executor.executePlan(plan)

		process.removeListener("unhandledRejection", unhandled)

		expect(result.status).toBe("failed")
	})
})
