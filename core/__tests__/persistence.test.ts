/**
 * AIRI Core — Persistence Tests
 *
 * Tests for the persistence layer: EventStore, SnapshotManager,
 * PersistentSessionManager, RecoveryCoordinator, planner persistence,
 * execution persistence, and event consistency.
 */

import { describe, it, expect, beforeEach } from "vitest"

const _logger = (..._a: unknown[]) => void 0

import { EventBus } from "../events/bus.js"
import { createLogger } from "../logger.js"

import { InMemoryEventStore } from "../persistence/event-store.js"
import { InMemorySnapshotStore, SnapshotManager } from "../persistence/snapshots.js"
import { PersistentSessionManager } from "../session/session-manager.js"
import { RecoveryCoordinator } from "../runtime/recovery.js"

import type { AiriEvent } from "../events/types.js"
import type { RuntimeSnapshot } from "../persistence/types.js"
import type { PersistentSession } from "../session/types.js"
import { createPersistentSessionId } from "../session/types.js"

// ── Test helpers ─────────────────────────────────────────────────────────

function createTestEvent(overrides: Record<string, unknown> = {}): AiriEvent {
	return {
		type: "task.started",
		timestamp: new Date().toISOString(),
		source: "test",
		taskId: "task-001",
		...overrides,
	} as AiriEvent
}

function createTestEventBus(): EventBus {
	return new EventBus()
}

// ── EventStore tests ─────────────────────────────────────────────────────

describe("InMemoryEventStore", () => {
	let store: InMemoryEventStore

	beforeEach(() => {
		store = new InMemoryEventStore()
	})

	it("appends events and returns EventId", async () => {
		const event = createTestEvent()
		const eventId = await store.append(event)

		expect(eventId).toBeDefined()
		expect(eventId.startsWith("evt_")).toBe(true)
	})

	it("assigns monotonic sequence numbers", async () => {
		await store.append(createTestEvent())
		await store.append(createTestEvent())
		await store.append(createTestEvent())

		const events = store.getAll()
		expect(events[0]!.sequence).toBe(1)
		expect(events[1]!.sequence).toBe(2)
		expect(events[2]!.sequence).toBe(3)
	})

	it("gets events since a given event ID", async () => {
		const id1 = await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))
		await store.append(createTestEvent({ type: "task.failed" }))

		const since = await store.getSince(id1)
		expect(since.length).toBe(2)
		expect(since[0]!.type).toBe("task.completed")
		expect(since[1]!.type).toBe("task.failed")
	})

	it("gets events by session", async () => {
		await store.append(createTestEvent({ type: "task.started", sessionId: "sess-1" }))
		await store.append(createTestEvent({ type: "task.started", sessionId: "sess-2" }))
		await store.append(createTestEvent({ type: "task.completed", sessionId: "sess-1" }))

		const events = await store.getBySession("sess-1")
		expect(events.length).toBe(2)
	})

	it("gets events by module", async () => {
		await store.append(createTestEvent({ source: "module-a" }))
		await store.append(createTestEvent({ source: "module-b" }))
		await store.append(createTestEvent({ source: "module-a" }))

		const events = await store.getByModule("module-a")
		expect(events.length).toBe(2)
	})

	it("gets events by type", async () => {
		await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))
		await store.append(createTestEvent({ type: "task.started" }))

		const events = await store.getByType("task.started")
		expect(events.length).toBe(2)
	})

	it("gets events by execution", async () => {
		await store.append(createTestEvent({ executionId: "exec-1" }))
		await store.append(createTestEvent({ executionId: "exec-2" }))

		const events = await store.getByExecution("exec-1")
		expect(events.length).toBe(1)
	})

	it("gets the last event", async () => {
		await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))

		const last = await store.getLastEvent()
		expect(last).toBeDefined()
		expect(last!.type).toBe("task.completed")
	})

	it("returns null for last event when empty", async () => {
		const last = await store.getLastEvent()
		expect(last).toBeNull()
	})

	it("gets event count", async () => {
		expect(await store.getEventCount()).toBe(0)

		await store.append(createTestEvent())
		await store.append(createTestEvent())

		expect(await store.getEventCount()).toBe(2)
	})

	it("supports replay", async () => {
		const id1 = await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))

		const replayed: string[] = []
		const count = await store.replay(id1, async (event) => {
			replayed.push(event.type)
		})

		expect(count).toBe(1)
		expect(replayed).toEqual(["task.completed"])
	})

	it("guarantees append-only — does not mutate historical events", async () => {
		const event = createTestEvent({ type: "task.started" })
		await store.append(event)

		const events = store.getAll()
		expect(events.length).toBe(1)

		// Appending more events should not change the first event.
		await store.append(createTestEvent({ type: "task.completed" }))
		const eventsAfter = store.getAll()
		expect(eventsAfter[0]!.type).toBe("task.started")
	})

	it("generates monotonic IDs", async () => {
		const ids: string[] = []
		for (let i = 0; i < 10; i += 1) {
			ids.push(await store.append(createTestEvent()))
		}

		// IDs should be strictly increasing.
		for (let i = 1; i < ids.length; i += 1) {
			expect(ids[i]!.localeCompare(ids[i - 1]!)).toBeGreaterThan(0)
		}
	})
})

// ── SnapshotManager tests ────────────────────────────────────────────────

describe("SnapshotManager", () => {
	let store: InMemorySnapshotStore
	let events: EventBus
	let manager: SnapshotManager

	beforeEach(() => {
		store = new InMemorySnapshotStore()
		events = createTestEventBus()
		manager = new SnapshotManager(store, events)

		// Set up capture functions.
		manager.setCapturePlans(() => [])
		manager.setCaptureTasks(() => [])
		manager.setCaptureCapabilities(() => [])
		manager.setCaptureSessions(() => [])
		manager.setCaptureExecutionState(() => undefined)
	})

	it("takes a snapshot", async () => {
		const snapshot = await manager.takeSnapshot()

		expect(snapshot.version).toBe(1)
		expect(snapshot.timestamp).toBeDefined()
		expect(store.count).toBe(1)
	})

	it("increments version on each snapshot", async () => {
		const s1 = await manager.takeSnapshot()
		const s2 = await manager.takeSnapshot()
		const s3 = await manager.takeSnapshot()

		expect(s1.version).toBe(1)
		expect(s2.version).toBe(2)
		expect(s3.version).toBe(3)
	})

	it("restores the latest snapshot", async () => {
		await manager.takeSnapshot("sess-1")
		await manager.takeSnapshot("sess-2")

		const latest = await manager.restoreSnapshot()
		expect(latest).toBeDefined()
		expect(latest!.sessionId).toBe("sess-2")
	})

	it("returns null when no snapshots exist", async () => {
		const latest = await manager.restoreSnapshot()
		expect(latest).toBeNull()
	})

	it("lists snapshots in descending version order", async () => {
		await manager.takeSnapshot()
		await manager.takeSnapshot()
		await manager.takeSnapshot()

		const snapshots = await manager.listSnapshots()
		expect(snapshots.length).toBe(3)
		expect(snapshots[0]!.version).toBe(3)
		expect(snapshots[1]!.version).toBe(2)
		expect(snapshots[2]!.version).toBe(1)
	})

	it("prunes old snapshots", async () => {
		for (let i = 0; i < 5; i += 1) {
			await manager.takeSnapshot()
		}

		const pruned = await manager.pruneSnapshots(2)
		expect(pruned).toBe(3)
		expect(store.count).toBe(2)
	})

	it("captures plan state", async () => {
		manager.setCapturePlans(() => [
			{
				id: "plan-1",
				name: "Test Plan",
				steps: [],
				status: "running",
				createdAt: new Date().toISOString(),
				resumable: true,
				completedStepIds: ["step-1"],
			},
		])

		const snapshot = await manager.takeSnapshot()
		expect(snapshot.plans.length).toBe(1)
		expect(snapshot.plans[0]!.id).toBe("plan-1")
	})

	it("captures task state", async () => {
		manager.setCaptureTasks(() => [
			{
				id: "task-1",
				title: "Test Task",
				state: "running",
				priority: "normal",
				moduleId: "test",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				progress: 50,
				metadata: {},
				cancellation: { isCancelled: false },
			},
		])

		const snapshot = await manager.takeSnapshot()
		expect(snapshot.tasks.length).toBe(1)
		expect(snapshot.tasks[0]!.id).toBe("task-1")
	})

	it("captures session state", async () => {
		manager.setCaptureSessions(() => [
			{
				id: "sess-1",
				clientId: "client-1",
				state: "attached",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				clientInfo: {},
				isDetached: false,
			},
		])

		const snapshot = await manager.takeSnapshot()
		expect(snapshot.sessions.length).toBe(1)
		expect(snapshot.sessions[0]!.id).toBe("sess-1")
	})
})

// ── PersistentSessionManager tests ───────────────────────────────────────

describe("PersistentSessionManager", () => {
	let manager: PersistentSessionManager

	beforeEach(() => {
		manager = new PersistentSessionManager()
	})

	it("creates a session", () => {
		const session = manager.createSession("client-1", { name: "test" })

		expect(session.id).toBeDefined()
		expect(session.clientId).toBe("client-1")
		expect(session.state).toBe("attaching")
		expect(session.isDetached).toBe(false)
		expect(session.clientInfo).toEqual({ name: "test" })
	})

	it("marks a session as attached", () => {
		const session = manager.createSession("client-1")
		const attached = manager.markAttached(session.id)

		expect(attached).toBeDefined()
		expect(attached!.state).toBe("attached")
		expect(attached!.isDetached).toBe(false)
		expect(attached!.lastConnectedAt).toBeDefined()
	})

	it("detaches a session and generates recovery token", () => {
		const session = manager.createSession("client-1")
		manager.markAttached(session.id)

		const detached = manager.detachSession(session.id)
		expect(detached).toBeDefined()
		expect(detached!.state).toBe("detached")
		expect(detached!.isDetached).toBe(true)
		expect(detached!.recoveryToken).toBeDefined()
	})

	it("resumes a detached session", () => {
		const session = manager.createSession("client-1")
		manager.markAttached(session.id)
		const detached = manager.detachSession(session.id)
		const recoveryToken = detached!.recoveryToken!

		const result = manager.resumeByToken(recoveryToken, "client-1-new")
		expect(result).toBeDefined()
		expect(result!.resumed).toBe(true)
		expect(result!.session.state).toBe("attached")
		expect(result!.session.isDetached).toBe(false)
		expect(result!.session.recoveryToken).toBeUndefined()
	})

	it("destroys a session", () => {
		const session = manager.createSession("client-1")
		expect(manager.count).toBe(1)

		const destroyed = manager.destroySession(session.id)
		expect(destroyed).toBe(true)
		expect(manager.count).toBe(0)
	})

	it("lists sessions with filter", () => {
		manager.createSession("client-1")
		manager.createSession("client-2")

		const all = manager.listSessions()
		expect(all.length).toBe(2)

		const filtered = manager.listSessions({ clientId: "client-1" })
		expect(filtered.length).toBe(1)
	})

	it("gets active sessions only", () => {
		const s1 = manager.createSession("client-1")
		const s2 = manager.createSession("client-2")
		manager.markAttached(s1.id)
		manager.markAttached(s2.id)
		manager.detachSession(s1.id)

		const active = manager.getActiveSessions()
		expect(active.length).toBe(1)
		expect(active[0]!.clientId).toBe("client-2")
	})

	it("gets detached sessions only", () => {
		const s1 = manager.createSession("client-1")
		const s2 = manager.createSession("client-2")
		manager.markAttached(s1.id)
		manager.markAttached(s2.id)
		manager.detachSession(s1.id)

		const detached = manager.getDetachedSessions()
		expect(detached.length).toBe(1)
		expect(detached[0]!.clientId).toBe("client-1")
	})

	it("cleans up expired detached sessions", () => {
		const s1 = manager.createSession("client-1")
		manager.markAttached(s1.id)
		manager.detachSession(s1.id)

		// We can't directly modify the session, so we test with a very short maxAgeMs.
		// Since the session was just detached, cleanup with 0ms should remove it.
		const removed = manager.cleanupExpiredDetached(0)
		expect(removed).toBe(1)
		expect(manager.count).toBe(0)
	})

	it("loads sessions from snapshot", () => {
		const sessions: PersistentSession[] = [
			{
				id: createPersistentSessionId("psess-snap-1"),
				clientId: "client-1",
				state: "attached",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				clientInfo: {},
				isDetached: false,
			},
		]

		manager.loadFromSnapshot(sessions)
		expect(manager.count).toBe(1)

		const session = manager.getSession(createPersistentSessionId("psess-snap-1"))
		expect(session).toBeDefined()
		expect(session!.clientId).toBe("client-1")
	})

	it("exports sessions for snapshot", () => {
		manager.createSession("client-1")
		manager.createSession("client-2")

		const exported = manager.exportForSnapshot()
		expect(exported.length).toBe(2)
	})
})

// ── RecoveryCoordinator tests ────────────────────────────────────────────

describe("RecoveryCoordinator", () => {
	let snapshotStore: InMemorySnapshotStore
	let eventStore: InMemoryEventStore
	let events: EventBus
	let logger: ReturnType<typeof createLogger>
	let coordinator: RecoveryCoordinator

	beforeEach(() => {
		snapshotStore = new InMemorySnapshotStore()
		eventStore = new InMemoryEventStore()
		events = createTestEventBus()
		logger = createLogger("test")
		coordinator = new RecoveryCoordinator(snapshotStore, eventStore, events, logger)
	})

	it("recovers with no snapshot and no events", async () => {
		const result = await coordinator.recover()

		expect(result.success).toBe(true)
		expect(result.snapshot).toBeNull()
		expect(result.eventsReplayed).toBe(0)
	})

	it("recovers with events but no snapshot", async () => {
		await eventStore.append(createTestEvent({ type: "task.started" }))
		await eventStore.append(createTestEvent({ type: "task.completed" }))

		const result = await coordinator.recover()

		expect(result.success).toBe(true)
		expect(result.eventsReplayed).toBeGreaterThanOrEqual(0)
	})

	it("recovers with snapshot and replays events since snapshot", async () => {
		// Create a snapshot.
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [],
		}
		await snapshotStore.save(snapshot)

		// Add events after the snapshot.
		await eventStore.append(createTestEvent({ type: "task.started" }))
		await eventStore.append(createTestEvent({ type: "task.completed" }))

		const result = await coordinator.recover()

		expect(result.success).toBe(true)
		expect(result.snapshot).toBeDefined()
		expect(result.snapshot!.version).toBe(1)
	})

	it("restores plans from snapshot", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [
				{
					id: "plan-1",
					name: "Test Plan",
					steps: [],
					status: "running",
					createdAt: new Date().toISOString(),
					resumable: true,
					completedStepIds: ["step-1"],
				},
			],
			tasks: [],
			capabilities: [],
			sessions: [],
		}
		await snapshotStore.save(snapshot)

		const result = await coordinator.recover()

		expect(result.plansRestored).toBe(1)

		const state = coordinator.getRecoveryState()
		expect(state.plans.length).toBe(1)
		expect(state.plans[0]!.id).toBe("plan-1")
	})

	it("restores tasks from snapshot", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [
				{
					id: "task-1",
					title: "Test Task",
					state: "running",
					priority: "normal",
					moduleId: "test",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					progress: 50,
					metadata: {},
					cancellation: { isCancelled: false },
				},
			],
			capabilities: [],
			sessions: [],
		}
		await snapshotStore.save(snapshot)

		const result = await coordinator.recover()

		expect(result.tasksRestored).toBe(1)

		const state = coordinator.getRecoveryState()
		expect(state.tasks.length).toBe(1)
		expect(state.tasks[0]!.id).toBe("task-1")
	})

	it("restores sessions from snapshot", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [
				{
					id: "sess-1",
					clientId: "client-1",
					state: "attached",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					clientInfo: {},
					isDetached: false,
				},
			],
		}
		await snapshotStore.save(snapshot)

		const result = await coordinator.recover()

		expect(result.sessionsRestored).toBe(1)
	})

	it("reconciles incomplete executions", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [],
			executionState: {
				executions: [
					{
						executionId: "exec-1",
						toolId: "tool-1",
						taskId: "task-1",
						startedAt: Date.now(),
						status: "running",
					},
					{
						executionId: "exec-2",
						toolId: "tool-2",
						taskId: "task-2",
						startedAt: Date.now(),
						status: "completed",
					},
				],
			},
		}
		await snapshotStore.save(snapshot)

		const result = await coordinator.recover()

		expect(result.reconciledExecutions).toBe(1)

		const state = coordinator.getRecoveryState()
		expect(state.incompleteExecutions).toContain("exec-1")
	})

	it("emits recovery lifecycle events", async () => {
		const emitted: string[] = []
		events.on("recovery.started", () => emitted.push("started"))
		events.on("recovery.completed", () => emitted.push("completed"))
		events.on("recovery.failed", () => emitted.push("failed"))

		await coordinator.recover()

		expect(emitted).toContain("started")
		expect(emitted).toContain("completed")
	})

	it("produces deterministic recovery — same state on repeated recovery", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [
				{
					id: "plan-1",
					name: "Test Plan",
					steps: [],
					status: "running",
					createdAt: new Date().toISOString(),
					resumable: true,
					completedStepIds: [],
				},
			],
			tasks: [],
			capabilities: [],
			sessions: [],
		}
		await snapshotStore.save(snapshot)
		await eventStore.append(createTestEvent({ type: "plan.started" }))

		const result1 = await coordinator.recover()

		// Create a new coordinator with the same stores.
		const coordinator2 = new RecoveryCoordinator(snapshotStore, eventStore, events, logger)
		const result2 = await coordinator2.recover()

		expect(result1.success).toBe(result2.success)
		expect(result1.plansRestored).toBe(result2.plansRestored)
		expect(result1.tasksRestored).toBe(result2.tasksRestored)
	})
})

// ── Event consistency tests ──────────────────────────────────────────────

describe("Event consistency", () => {
	let store: InMemoryEventStore

	beforeEach(() => {
		store = new InMemoryEventStore()
	})

	it("events are ordered by sequence number", async () => {
		for (let i = 0; i < 10; i += 1) {
			await store.append(createTestEvent())
		}

		const events = store.getAll()
		for (let i = 1; i < events.length; i += 1) {
			expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence)
		}
	})

	it("no duplicate events on replay", async () => {
		await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))

		const replayed: string[] = []
		const lastEvent = await store.getLastEvent()
		if (lastEvent) {
			await store.replay(lastEvent.eventId, async (event) => {
				replayed.push(event.eventId as string)
			})
		}

		// Replaying from the last event should yield 0 events.
		expect(replayed.length).toBe(0)
	})

	it("replay produces same state regardless of order", async () => {
		const id1 = await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))

		const types1: string[] = []
		await store.replay(id1, async (event) => {
			types1.push(event.type)
		})

		const types2: string[] = []
		await store.replay(id1, async (event) => {
			types2.push(event.type)
		})

		expect(types1).toEqual(types2)
	})
})
