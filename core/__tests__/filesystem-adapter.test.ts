/**
 * AIRI Core — Filesystem Adapter Tests
 *
 * Tests for the filesystem-based persistence adapters.
 * Uses a temporary directory for each test.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"

import { FilesystemPersistenceAdapter } from "../persistence/adapters/filesystem/adapter.js"
import { FilesystemEventStore } from "../persistence/adapters/filesystem/event-store.js"
import { FilesystemSnapshotStore } from "../persistence/adapters/filesystem/snapshot-store.js"
import { FilesystemRuntimeStateStore } from "../persistence/adapters/filesystem/runtime-state-store.js"

import type { AiriEvent } from "../events/types.js"
import type { RuntimeSnapshot } from "../persistence/types.js"

// ── Test helpers ─────────────────────────────────────────────────────────

async function createTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "airi-test-"))
}

async function cleanupDir(dir: string): Promise<void> {
	await fs.rm(dir, { recursive: true, force: true })
}

function createTestEvent(overrides: Partial<AiriEvent> = {}): AiriEvent {
	return {
		type: "task.started",
		timestamp: new Date().toISOString(),
		source: "test",
		taskId: "task-001",
		...overrides,
	} as AiriEvent
}

// ── FilesystemPersistenceAdapter tests ───────────────────────────────────

describe("FilesystemPersistenceAdapter", () => {
	let adapter: FilesystemPersistenceAdapter
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await createTempDir()
		adapter = new FilesystemPersistenceAdapter(tmpDir)
		await adapter.initialize()
	})

	afterEach(async () => {
		await cleanupDir(tmpDir)
	})

	it("writes and reads data", async () => {
		const data = Buffer.from("hello world", "utf-8")
		await adapter.write("test:key", data)

		const read = await adapter.read("test:key")
		expect(read).toBeDefined()
		expect(read!.toString("utf-8")).toBe("hello world")
	})

	it("returns null for non-existent keys", async () => {
		const read = await adapter.read("nonexistent")
		expect(read).toBeNull()
	})

	it("overwrites existing data", async () => {
		await adapter.write("key", Buffer.from("first"))
		await adapter.write("key", Buffer.from("second"))

		const read = await adapter.read("key")
		expect(read!.toString("utf-8")).toBe("second")
	})

	it("appends data", async () => {
		await adapter.append("log", Buffer.from("line1\n"))
		await adapter.append("log", Buffer.from("line2\n"))

		const read = await adapter.read("log")
		expect(read!.toString("utf-8")).toBe("line1\nline2\n")
	})

	it("deletes data", async () => {
		await adapter.write("key", Buffer.from("data"))
		await adapter.delete("key")

		const read = await adapter.read("key")
		expect(read).toBeNull()
	})

	it("does not throw on deleting non-existent key", async () => {
		await expect(adapter.delete("nonexistent")).resolves.toBeUndefined()
	})

	it("lists keys with prefix", async () => {
		await adapter.write("events:a", Buffer.from("1"))
		await adapter.write("events:b", Buffer.from("2"))
		await adapter.write("other:c", Buffer.from("3"))

		const keys = await adapter.list("events:")
		expect(keys.length).toBe(2)
	})

	it("checks existence", async () => {
		await adapter.write("key", Buffer.from("data"))

		expect(await adapter.exists("key")).toBe(true)
		expect(await adapter.exists("nonexistent")).toBe(false)
	})

	it("supports atomic writes", async () => {
		// Write a large value and verify it's fully written.
		const largeData = Buffer.alloc(1024 * 1024, "x")
		await adapter.write("large", largeData)

		const read = await adapter.read("large")
		expect(read!.length).toBe(1024 * 1024)
	})

	it("supports transactions", async () => {
		const tx = adapter.transaction()
		tx.write("tx:a", Buffer.from("1"))
		tx.write("tx:b", Buffer.from("2"))
		tx.delete("tx:c")
		await tx.commit()

		expect((await adapter.read("tx:a"))!.toString()).toBe("1")
		expect((await adapter.read("tx:b"))!.toString()).toBe("2")
	})

	it("rolls back transactions", async () => {
		await adapter.write("rb:a", Buffer.from("original"))

		const tx = adapter.transaction()
		tx.write("rb:a", Buffer.from("modified"))
		tx.write("rb:b", Buffer.from("new"))
		await tx.rollback()

		// Original value should be unchanged.
		expect((await adapter.read("rb:a"))!.toString()).toBe("original")
		expect(await adapter.exists("rb:b")).toBe(false)
	})
})

// ── FilesystemEventStore tests ───────────────────────────────────────────

describe("FilesystemEventStore", () => {
	let store: FilesystemEventStore
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await createTempDir()
		const adapter = new FilesystemPersistenceAdapter(tmpDir)
		store = new FilesystemEventStore(adapter)
		await store.initialize()
	})

	afterEach(async () => {
		await cleanupDir(tmpDir)
	})

	it("appends and retrieves events", async () => {
		const event = createTestEvent()
		const eventId = await store.append(event)

		expect(eventId).toBeDefined()

		const last = await store.getLastEvent()
		expect(last).toBeDefined()
		expect(last!.type).toBe("task.started")
	})

	it("queries events by type", async () => {
		await store.append(createTestEvent({ type: "task.started" }))
		await store.append(createTestEvent({ type: "task.completed" }))
		await store.append(createTestEvent({ type: "task.started" }))

		const events = await store.getByType("task.started")
		expect(events.length).toBe(2)
	})

	it("queries events by module", async () => {
		await store.append(createTestEvent({ source: "module-a" }))
		await store.append(createTestEvent({ source: "module-b" }))

		const events = await store.getByModule("module-a")
		expect(events.length).toBe(1)
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
		await store.replay(id1, async (event) => {
			replayed.push(event.type)
		})

		expect(replayed).toEqual(["task.completed"])
	})
})

// ── FilesystemSnapshotStore tests ────────────────────────────────────────

describe("FilesystemSnapshotStore", () => {
	let store: FilesystemSnapshotStore
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await createTempDir()
		const adapter = new FilesystemPersistenceAdapter(tmpDir)
		store = new FilesystemSnapshotStore(adapter)
		await store.initialize()
	})

	afterEach(async () => {
		await cleanupDir(tmpDir)
	})

	it("saves and loads snapshots", async () => {
		const snapshot: RuntimeSnapshot = {
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [],
		}

		await store.save(snapshot)
		const loaded = await store.load(1)

		expect(loaded).toBeDefined()
		expect(loaded!.version).toBe(1)
	})

	it("gets the latest snapshot", async () => {
		await store.save({
			version: 1,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [],
		})

		await store.save({
			version: 2,
			timestamp: Date.now(),
			plans: [],
			tasks: [],
			capabilities: [],
			sessions: [],
		})

		const latest = await store.getLatest()
		expect(latest).toBeDefined()
		expect(latest!.version).toBe(2)
	})

	it("lists snapshots in descending version order", async () => {
		for (let i = 1; i <= 3; i++) {
			await store.save({
				version: i,
				timestamp: Date.now(),
				plans: [],
				tasks: [],
				capabilities: [],
				sessions: [],
			})
		}

		const snapshots = await store.list()
		expect(snapshots.length).toBe(3)
		expect(snapshots[0]!.version).toBe(3)
		expect(snapshots[2]!.version).toBe(1)
	})

	it("prunes old snapshots", async () => {
		for (let i = 1; i <= 5; i++) {
			await store.save({
				version: i,
				timestamp: Date.now(),
				plans: [],
				tasks: [],
				capabilities: [],
				sessions: [],
			})
		}

		const pruned = await store.prune(2)
		expect(pruned).toBe(3)

		const remaining = await store.list()
		expect(remaining.length).toBe(2)
	})

	it("returns null for non-existent snapshot", async () => {
		const loaded = await store.load(999)
		expect(loaded).toBeNull()
	})
})

// ── FilesystemRuntimeStateStore tests ────────────────────────────────────

describe("FilesystemRuntimeStateStore", () => {
	let store: FilesystemRuntimeStateStore
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await createTempDir()
		const adapter = new FilesystemPersistenceAdapter(tmpDir)
		store = new FilesystemRuntimeStateStore(adapter)
		await store.initialize()
	})

	afterEach(async () => {
		await cleanupDir(tmpDir)
	})

	it("sets and gets values", async () => {
		await store.set("key", { value: 42 })
		const result = await store.get<{ value: number }>("key")

		expect(result).toEqual({ value: 42 })
	})

	it("returns null for non-existent keys", async () => {
		const result = await store.get("nonexistent")
		expect(result).toBeNull()
	})

	it("deletes keys", async () => {
		await store.set("key", "value")
		await store.delete("key")

		const result = await store.get("key")
		expect(result).toBeNull()
	})

	it("checks existence", async () => {
		await store.set("key", "value")

		expect(await store.has("key")).toBe(true)
		expect(await store.has("nonexistent")).toBe(false)
	})

	it("clears all keys", async () => {
		await store.set("key1", "value1")
		await store.set("key2", "value2")

		await store.clear()

		expect(await store.has("key1")).toBe(false)
		expect(await store.has("key2")).toBe(false)
	})

	it("supports complex objects", async () => {
		const complex = {
			nested: { array: [1, 2, 3], bool: true },
			null: null,
		}

		await store.set("complex", complex)
		const result = await store.get("complex")

		expect(result).toEqual(complex)
	})
})
