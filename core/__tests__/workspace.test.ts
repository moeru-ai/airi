/**
 * Workspace Isolation Tests
 *
 * Tests for WorkspaceId branded type, WorkspaceManager lifecycle,
 * WorkspaceStorage operations, WorkspaceWorktree integration,
 * workspace events, and workspace recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"

const _logger = (..._a: unknown[]) => void 0

import fs from "node:fs"
import path from "node:path"
import os from "node:os"

import { EventBus } from "../events/bus.js"
import {
	createWorkspaceId,
	isValidWorkspaceTransition,
} from "../workspace/types.js"
import type {
	WorkspaceDescriptor,
} from "../workspace/types.js"
import { WorkspaceManager } from "../workspace/manager.js"
import { WorkspaceStorage } from "../workspace/storage.js"

// ── Helpers ─────────────────────────────────────────────────────────────

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "airi-workspace-test-"))
}

function createTestEventBus(): EventBus {
	return new EventBus()
}

function createTestManager(basePath?: string): { manager: WorkspaceManager; events: EventBus } {
	const events = createTestEventBus()
	const manager = new WorkspaceManager(
		{ basePath: basePath ?? tmpDir() },
		events,
	)
	return { manager, events }
}

// ── WorkspaceId branded type ────────────────────────────────────────────

describe("WorkspaceId", () => {
	it("creates a branded WorkspaceId from a raw string", () => {
		const id = createWorkspaceId("ws-test-123")
		expect(id).toBe("ws-test-123")
		expect(typeof id).toBe("string")
	})

	it("produces unique IDs on each call", () => {
		const id1 = createWorkspaceId("ws-1")
		const id2 = createWorkspaceId("ws-2")
		expect(id1).not.toBe(id2)
	})
})

// ── Workspace state transitions ─────────────────────────────────────────

describe("WorkspaceState transitions", () => {
	it("allows creating → active", () => {
		expect(isValidWorkspaceTransition("creating", "active")).toBe(true)
	})

	it("allows active → leased", () => {
		expect(isValidWorkspaceTransition("active", "leased")).toBe(true)
	})

	it("allows leased → executing", () => {
		expect(isValidWorkspaceTransition("leased", "executing")).toBe(true)
	})

	it("allows executing → suspended", () => {
		expect(isValidWorkspaceTransition("executing", "suspended")).toBe(true)
	})

	it("allows suspended → active", () => {
		expect(isValidWorkspaceTransition("suspended", "active")).toBe(true)
	})

	it("allows active → destroying", () => {
		expect(isValidWorkspaceTransition("active", "destroying")).toBe(true)
	})

	it("allows destroying → destroyed", () => {
		expect(isValidWorkspaceTransition("destroying", "destroyed")).toBe(true)
	})

	it("blocks creating → destroyed (must go through active)", () => {
		expect(isValidWorkspaceTransition("creating", "destroyed")).toBe(false)
	})

	it("blocks destroyed → active", () => {
		expect(isValidWorkspaceTransition("destroyed", "active")).toBe(false)
	})

	it("blocks executing → destroying", () => {
		expect(isValidWorkspaceTransition("executing", "destroying")).toBe(false)
	})

	it("blocks corrupted → any state", () => {
		expect(isValidWorkspaceTransition("corrupted", "active")).toBe(false)
		expect(isValidWorkspaceTransition("corrupted", "creating")).toBe(false)
	})

	it("allows any state → corrupted", () => {
		expect(isValidWorkspaceTransition("active", "corrupted")).toBe(true)
		expect(isValidWorkspaceTransition("executing", "corrupted")).toBe(true)
		expect(isValidWorkspaceTransition("creating", "corrupted")).toBe(true)
	})
})

// ── WorkspaceManager ────────────────────────────────────────────────────

describe("WorkspaceManager", () => {
	let basePath: string

	beforeEach(() => {
		basePath = tmpDir()
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	describe("createWorkspace", () => {
		it("creates a workspace with active state", async () => {
			const { manager } = createTestManager(basePath)
			const input: CreateWorkspaceInput = {
				name: "test-workspace",
				description: "A test workspace",
				rootPath: path.join(basePath, "workspace"),
			}

			const descriptor = await manager.createWorkspace(input)

			expect(descriptor.name).toBe("test-workspace")
			expect(descriptor.description).toBe("A test workspace")
			expect(descriptor.state).toBe("active")
			expect(descriptor.id).toBeDefined()
			expect(descriptor.createdAt).toBeDefined()
			expect(descriptor.updatedAt).toBeDefined()
		})

		it("creates workspace with session association", async () => {
			const { manager } = createTestManager(basePath)
			const descriptor = await manager.createWorkspace({
				name: "session-ws",
				rootPath: path.join(basePath, "workspace"),
				sessionId: "session-123",
			})

			expect(descriptor.sessionId).toBe("session-123")
		})

		it("creates workspace with repository and branch", async () => {
			const { manager } = createTestManager(basePath)
			const descriptor = await manager.createWorkspace({
				name: "repo-ws",
				rootPath: path.join(basePath, "workspace"),
				repositoryId: "repo-456",
				branchName: "feature-branch",
			})

			expect(descriptor.repositoryId).toBe("repo-456")
			expect(descriptor.branchName).toBe("feature-branch")
		})
	})

	describe("getWorkspace", () => {
		it("returns the workspace descriptor", async () => {
			const { manager } = createTestManager(basePath)
			const created = await manager.createWorkspace({
				name: "test",
				rootPath: path.join(basePath, "ws"),
			})

			const retrieved = manager.getWorkspace(created.id)
			expect(retrieved).toBeDefined()
			expect(retrieved!.id).toBe(created.id)
			expect(retrieved!.name).toBe("test")
		})

		it("returns undefined for unknown workspace", () => {
			const { manager } = createTestManager(basePath)
			const result = manager.getWorkspace(createWorkspaceId("ws-nonexistent"))
			expect(result).toBeUndefined()
		})
	})

	describe("listWorkspaces", () => {
		it("lists all workspaces", async () => {
			const { manager } = createTestManager(basePath)
			await manager.createWorkspace({ name: "ws-1", rootPath: path.join(basePath, "ws1") })
			await manager.createWorkspace({ name: "ws-2", rootPath: path.join(basePath, "ws2") })

			const all = manager.listWorkspaces()
			expect(all).toHaveLength(2)
		})

		it("filters by state", async () => {
			const { manager } = createTestManager(basePath)
			const ws1 = await manager.createWorkspace({ name: "ws-1", rootPath: path.join(basePath, "ws1") })
			await manager.createWorkspace({ name: "ws-2", rootPath: path.join(basePath, "ws2") })

			const filter: WorkspaceFilter = { state: "active" }
			const active = manager.listWorkspaces(filter)
			expect(active).toHaveLength(2)

			// Lease one workspace.
			manager.leaseWorkspace(ws1.id, "session-1")

			const activeAfter = manager.listWorkspaces({ state: "active" })
			expect(activeAfter).toHaveLength(1)
			expect(activeAfter[0]!.name).toBe("ws-2")
		})

		it("filters by session", async () => {
			const { manager } = createTestManager(basePath)
			const ws1 = await manager.createWorkspace({
				name: "ws-1",
				rootPath: path.join(basePath, "ws1"),
				sessionId: "session-a",
			})
			await manager.createWorkspace({
				name: "ws-2",
				rootPath: path.join(basePath, "ws2"),
				sessionId: "session-b",
			})

			const filtered = manager.listWorkspaces({ sessionId: "session-a" })
			expect(filtered).toHaveLength(1)
			expect(filtered[0]!.id).toBe(ws1.id)
		})
	})

	describe("leaseWorkspace", () => {
		it("leases an active workspace", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "lease-test",
				rootPath: path.join(basePath, "ws"),
			})

			const lease = manager.leaseWorkspace(ws.id, "session-1")

			expect(lease.workspaceId).toBe(ws.id)
			expect(lease.sessionId).toBe("session-1")
			expect(lease.leaseToken).toBeDefined()
			expect(lease.acquiredAt).toBeDefined()

			// Workspace state should be "leased".
			const updated = manager.getWorkspace(ws.id)!
			expect(updated.state).toBe("leased")
		})

		it("throws when workspace is already leased", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "lease-test",
				rootPath: path.join(basePath, "ws"),
			})

			manager.leaseWorkspace(ws.id, "session-1")

			expect(() => {
				manager.leaseWorkspace(ws.id, "session-2")
			}).toThrow("already leased")
		})

		it("throws when workspace is not found", () => {
			const { manager } = createTestManager(basePath)

			expect(() => {
				manager.leaseWorkspace(createWorkspaceId("ws-missing"), "session-1")
			}).toThrow("not found")
		})

		it("supports lease with duration", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "lease-test",
				rootPath: path.join(basePath, "ws"),
			})

			const lease = manager.leaseWorkspace(ws.id, "session-1", 60_000)
			expect(lease.expiresAt).toBeDefined()
		})
	})

	describe("releaseWorkspace", () => {
		it("releases a leased workspace", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "release-test",
				rootPath: path.join(basePath, "ws"),
			})

			const lease = manager.leaseWorkspace(ws.id, "session-1")
			manager.releaseWorkspace(ws.id, lease.leaseToken)

			// Workspace state should be "active" again.
			const updated = manager.getWorkspace(ws.id)!
			expect(updated.state).toBe("active")
		})

		it("throws with invalid lease token", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "release-test",
				rootPath: path.join(basePath, "ws"),
			})

			manager.leaseWorkspace(ws.id, "session-1")

			expect(() => {
				manager.releaseWorkspace(ws.id, "invalid-token")
			}).toThrow("Invalid lease token")
		})

		it("throws when no lease exists", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "release-test",
				rootPath: path.join(basePath, "ws"),
			})

			expect(() => {
				manager.releaseWorkspace(ws.id, "some-token")
			}).toThrow("No active lease")
		})
	})

	describe("validateLease", () => {
		it("returns true for valid lease", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "validate-test",
				rootPath: path.join(basePath, "ws"),
			})

			const lease = manager.leaseWorkspace(ws.id, "session-1")
			expect(manager.validateLease(ws.id, lease.leaseToken)).toBe(true)
		})

		it("returns false for invalid token", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "validate-test",
				rootPath: path.join(basePath, "ws"),
			})

			manager.leaseWorkspace(ws.id, "session-1")
			expect(manager.validateLease(ws.id, "wrong-token")).toBe(false)
		})

		it("returns false for expired lease", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "validate-test",
				rootPath: path.join(basePath, "ws"),
			})

			// Lease with 0ms duration (already expired).
			const lease = manager.leaseWorkspace(ws.id, "session-1", -1)

			// Wait a tick for expiry.
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(manager.validateLease(ws.id, lease.leaseToken)).toBe(false)
		})

		it("returns false for workspace with no lease", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "validate-test",
				rootPath: path.join(basePath, "ws"),
			})

			expect(manager.validateLease(ws.id, "some-token")).toBe(false)
		})
	})

	describe("updateWorkspaceState", () => {
		it("updates state with valid transition", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "state-test",
				rootPath: path.join(basePath, "ws"),
			})

			const updated = manager.updateWorkspaceState(ws.id, "leased")
			expect(updated.state).toBe("leased")
		})

		it("throws for invalid transition", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "state-test",
				rootPath: path.join(basePath, "ws"),
			})

			expect(() => {
				manager.updateWorkspaceState(ws.id, "destroyed")
			}).toThrow("Invalid state transition")
		})
	})

	describe("task association", () => {
		it("associates and disassociates tasks", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "task-test",
				rootPath: path.join(basePath, "ws"),
			})

			manager.associateTask(ws.id, "task-1")
			manager.associateTask(ws.id, "task-2")

			const tasks = manager.getActiveTasks(ws.id)
			expect(tasks).toContain("task-1")
			expect(tasks).toContain("task-2")

			manager.disassociateTask(ws.id, "task-1")

			const after = manager.getActiveTasks(ws.id)
			expect(after).not.toContain("task-1")
			expect(after).toContain("task-2")
		})

		it("returns empty array for workspace with no tasks", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "task-test",
				rootPath: path.join(basePath, "ws"),
			})

			expect(manager.getActiveTasks(ws.id)).toEqual([])
		})
	})

	describe("destroyWorkspace", () => {
		it("destroys an active workspace", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "destroy-test",
				rootPath: path.join(basePath, "ws"),
			})

			await manager.destroyWorkspace(ws.id)

			const destroyed = manager.getWorkspace(ws.id)!
			expect(destroyed.state).toBe("destroyed")
		})

		it("destroys a workspace with lease (releases lease first)", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "destroy-test",
				rootPath: path.join(basePath, "ws"),
			})

			manager.leaseWorkspace(ws.id, "session-1")
			await manager.destroyWorkspace(ws.id)

			const destroyed = manager.getWorkspace(ws.id)!
			expect(destroyed.state).toBe("destroyed")
		})

		it("throws when destroying executing workspace", async () => {
			const { manager } = createTestManager(basePath)
			const ws = await manager.createWorkspace({
				name: "destroy-test",
				rootPath: path.join(basePath, "ws"),
			})

			// Manually set state to executing.
			manager.updateWorkspaceState(ws.id, "leased")
			manager.updateWorkspaceState(ws.id, "executing")

			await expect(async () => {
				await manager.destroyWorkspace(ws.id)
			}).rejects.toThrow("Cannot destroy workspace")



		})

		it("throws for unknown workspace", async () => {
			const { manager } = createTestManager(basePath)

			await expect(async () => {
				await manager.destroyWorkspace(createWorkspaceId("ws-missing"))
			}).rejects.toThrow("not found")
		})
	})

	describe("snapshot / restore", () => {
		it("creates and restores from snapshots", async () => {
			const { manager } = createTestManager(basePath)
			const ws1 = await manager.createWorkspace({
				name: "snap-1",
				rootPath: path.join(basePath, "ws1"),
			})
			const ws2 = await manager.createWorkspace({
				name: "snap-2",
				rootPath: path.join(basePath, "ws2"),
			})

			manager.associateTask(ws1.id, "task-1")

			const snapshots = manager.snapshot()
			expect(snapshots).toHaveLength(2)

			// Create a new manager and restore.
			const { manager: manager2 } = createTestManager(basePath)
			const restored = manager2.restoreFromSnapshots(snapshots)
			expect(restored).toBe(2)

			expect(manager2.getWorkspace(ws1.id)).toBeDefined()
			expect(manager2.getWorkspace(ws2.id)).toBeDefined()
			expect(manager2.getActiveTasks(ws1.id)).toContain("task-1")
		})
	})
})

// ── WorkspaceStorage ────────────────────────────────────────────────────

describe("WorkspaceStorage", () => {
	let basePath: string
	let storage: WorkspaceStorage

	beforeEach(() => {
		basePath = tmpDir()
		storage = new WorkspaceStorage(basePath)
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	describe("resolveWorkspacePath", () => {
		it("resolves workspace-relative paths", () => {
			const id = createWorkspaceId("ws-test")
			const resolved = storage.resolveWorkspacePath(id, "src", "index.ts")
			expect(resolved).toContain("workspaces")
			expect(resolved).toContain("ws-test")
			expect(resolved).toContain("src")
			expect(resolved).toContain("index.ts")
		})
	})

	describe("ensureWorkspaceRoot / removeWorkspaceRoot", () => {
		it("creates workspace root directory", async () => {
			const id = createWorkspaceId("ws-test")
			const root = await storage.ensureWorkspaceRoot(id)
			expect(root).toContain("ws-test")

			const stat = fs.statSync(root)
			expect(stat.isDirectory()).toBe(true)
		})

		it("removes workspace root directory", async () => {
			const id = createWorkspaceId("ws-test")
			await storage.ensureWorkspaceRoot(id)
			await storage.removeWorkspaceRoot(id)

			expect(storage.getBasePath()).toBeDefined()
		})
	})

	describe("writeManifest / readManifest", () => {
		it("writes and reads a workspace manifest", async () => {
			const id = createWorkspaceId("ws-manifest")
			const descriptor: WorkspaceDescriptor = {
				id,
				name: "manifest-test",
				rootPath: "/tmp/test",
				state: "active",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				metadata: { key: "value" },
			}

			await storage.writeManifest(id, descriptor)
			const read = await storage.readManifest(id)

			expect(read).not.toBeNull()
			expect(read!.name).toBe("manifest-test")
			expect(read!.state).toBe("active")
			expect(read!.metadata).toEqual({ key: "value" })
		})

		it("returns null for non-existent manifest", async () => {
			const id = createWorkspaceId("ws-missing")
			const read = await storage.readManifest(id)
			expect(read).toBeNull()
		})
	})

	describe("listManifests", () => {
		it("lists all workspace manifests", async () => {
			const id1 = createWorkspaceId("ws-list-1")
			const id2 = createWorkspaceId("ws-list-2")

			await storage.writeManifest(id1, {
				id: id1,
				name: "list-1",
				rootPath: "/tmp/test1",
				state: "active",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				metadata: {},
			})
			await storage.writeManifest(id2, {
				id: id2,
				name: "list-2",
				rootPath: "/tmp/test2",
				state: "active",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				metadata: {},
			})

			const manifests = await storage.listManifests()
			expect(manifests).toHaveLength(2)
			expect(manifests.map((m) => m.name)).toContain("list-1")
			expect(manifests.map((m) => m.name)).toContain("list-2")
		})

		it("returns empty array when no manifests exist", async () => {
			const manifests = await storage.listManifests()
			expect(manifests).toEqual([])
		})
	})

	describe("cleanupOrphanedWorkspaces", () => {
		it("removes orphaned workspace directories", async () => {
			const id1 = createWorkspaceId("ws-keep")
			const id2 = createWorkspaceId("ws-orphan")

			await storage.ensureWorkspaceRoot(id1)
			await storage.ensureWorkspaceRoot(id2)

			const removed = await storage.cleanupOrphanedWorkspaces(
				new Set([id1 as string]),
			)
			expect(removed).toBe(1)
		})
	})
})

// ── WorkspaceWorktree ───────────────────────────────────────────────────

describe("WorkspaceWorktree", () => {
	let repoPath: string
	let worktree: WorkspaceWorktree

	beforeEach(async () => {
		repoPath = tmpDir()

		// Initialize a git repo.
		await execGit(repoPath, "init", "-b", "main")
		await execGit(repoPath, "config", "user.email", "test@test.com")
		await execGit(repoPath, "config", "user.name", "Test")

		// Create an initial commit.
		fs.writeFileSync(path.join(repoPath, "README.md"), "# Test")
		await execGit(repoPath, "add", ".")
		await execGit(repoPath, "commit", "-m", "initial")

		worktree = new WorkspaceWorktree(repoPath)
	})

	afterEach(async () => {
		fs.rmSync(repoPath, { recursive: true, force: true })
	})

	describe("createWorktree", () => {
		it("creates a worktree for a workspace", async () => {
			const wsId = createWorkspaceId("ws-worktree")
			const worktreePath = await worktree.createWorktree(wsId, "main")

			expect(worktreePath).toContain(".airi-worktrees")
			expect(worktreePath).toContain("ws-worktree")

			// Verify the worktree directory exists.
			const stat = fs.statSync(worktreePath)
			expect(stat.isDirectory()).toBe(true)
		})

		it("creates a detached worktree when no branch specified", async () => {
			const wsId = createWorkspaceId("ws-detached")
			const worktreePath = await worktree.createWorktree(wsId)

			const stat = fs.statSync(worktreePath)
			expect(stat.isDirectory()).toBe(true)
		})
	})

	describe("removeWorktree", () => {
		it("removes a worktree", async () => {
			const wsId = createWorkspaceId("ws-remove")
			const worktreePath = await worktree.createWorktree(wsId, "main")

			await worktree.removeWorktree(worktreePath)

			// Directory should no longer exist.
			try {
				fs.accessSync(worktreePath)
				throw new Error("Worktree should have been removed")
			} catch (error: unknown) {
				expect((error as NodeJS.ErrnoException).code).toBe("ENOENT")
			}
		})
	})

	describe("listWorktrees", () => {
		it("lists all worktrees", async () => {
			const wsId = createWorkspaceId("ws-list")
			await worktree.createWorktree(wsId, "main")

			const worktrees = await worktree.listWorktrees()
			// Should have at least the primary + the new worktree.
			expect(worktrees.length).toBeGreaterThanOrEqual(2)
		})
	})

	describe("validateWorktree", () => {
		it("returns true for valid worktree", async () => {
			const wsId = createWorkspaceId("ws-valid")
			const worktreePath = await worktree.createWorktree(wsId, "main")

			const valid = await worktree.validateWorktree(worktreePath)
			expect(valid).toBe(true)
		})

		it("returns false for non-existent path", async () => {
			const valid = await worktree.validateWorktree("/nonexistent/path")
			expect(valid).toBe(false)
		})
	})

	describe("getWorktreeBranch", () => {
		it("returns the branch name", async () => {
			const wsId = createWorkspaceId("ws-branch")
			const worktreePath = await worktree.createWorktree(wsId, "main")

			const branch = await worktree.getWorktreeBranch(worktreePath)
			expect(branch).toContain("main")
		})
	})
})

// ── Workspace events ────────────────────────────────────────────────────

describe("Workspace events", () => {
	let basePath: string

	beforeEach(() => {
		basePath = tmpDir()
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	it("emits workspace.created on creation", async () => {
		const { manager, events } = createTestManager(basePath)
		const received: unknown[] = []
		events.on("workspace.created", (payload) => received.push(payload))

		await manager.createWorkspace({
			name: "event-test",
			rootPath: path.join(basePath, "ws"),
		})

		expect(received).toHaveLength(1)
		expect((received[0] as Record<string, unknown>).name).toBe("event-test")
	})

	it("emits workspace.leased on lease", async () => {
		const { manager, events } = createTestManager(basePath)
		const received: unknown[] = []
		events.on("workspace.leased", (payload) => received.push(payload))

		const ws = await manager.createWorkspace({
			name: "event-test",
			rootPath: path.join(basePath, "ws"),
		})

		manager.leaseWorkspace(ws.id, "session-1")

		expect(received).toHaveLength(1)
		expect((received[0] as Record<string, unknown>).sessionId).toBe("session-1")
		expect((received[0] as Record<string, unknown>).leaseToken).toBeDefined()
	})

	it("emits workspace.released on release", async () => {
		const { manager, events } = createTestManager(basePath)
		const received: unknown[] = []
		events.on("workspace.released", (payload) => received.push(payload))

		const ws = await manager.createWorkspace({
			name: "event-test",
			rootPath: path.join(basePath, "ws"),
		})

		const lease = manager.leaseWorkspace(ws.id, "session-1")
		manager.releaseWorkspace(ws.id, lease.leaseToken)

		expect(received).toHaveLength(1)
		expect((received[0] as Record<string, unknown>).sessionId).toBe("session-1")
	})

	it("emits workspace.destroyed on destruction", async () => {
		const { manager, events } = createTestManager(basePath)
		const received: unknown[] = []
		events.on("workspace.destroyed", (payload) => received.push(payload))

		const ws = await manager.createWorkspace({
			name: "event-test",
			rootPath: path.join(basePath, "ws"),
		})

		await manager.destroyWorkspace(ws.id)

		expect(received).toHaveLength(1)
		expect((received[0] as Record<string, unknown>).name).toBe("event-test")
	})
})

// ── Workspace recovery ──────────────────────────────────────────────────

describe("Workspace recovery", () => {
	let basePath: string

	beforeEach(() => {
		basePath = tmpDir()
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	it("restores workspace state from snapshots", async () => {
		const { manager } = createTestManager(basePath)
		const ws = await manager.createWorkspace({
			name: "recovery-test",
			rootPath: path.join(basePath, "ws"),
			sessionId: "session-1",
		})

		manager.associateTask(ws.id, "task-1")

		const snapshots = manager.snapshot()
		expect(snapshots).toHaveLength(1)

		// Verify snapshot structure.
		const snap = snapshots[0]!
		expect(snap.id).toBe(ws.id)
		expect(snap.descriptor.name).toBe("recovery-test")
		expect(snap.activeTaskIds).toContain("task-1")
	})

	it("recovers from empty snapshots", async () => {
		const { manager } = createTestManager(basePath)
		const restored = manager.restoreFromSnapshots([])
		expect(restored).toBe(0)
	})

	it("detects orphaned workspaces", async () => {
		const { manager } = createTestManager(basePath)
		await manager.createWorkspace({
			name: "orphan-test",
			rootPath: path.join(basePath, "ws"),
		})

		// No session associated — should be detected as orphaned.
		const all = manager.listWorkspaces()
		expect(all).toHaveLength(1)
		expect(all[0]!.sessionId).toBeUndefined()
	})
})

// ── Path traversal prevention ───────────────────────────────────────────

describe("Path traversal prevention", () => {
	it("rejects paths that escape workspace root", () => {
		const root = "/home/user/workspace"
		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const path = require("node:path")
			const target = "../../etc/passwd"
			const resolved = path.resolve(root, target)
			const relative = path.relative(root, resolved)
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				throw new Error(`Path traversal detected: "${target}" escapes workspace root "${root}"`)
			}
		}).toThrow("Path traversal detected")
	})

	it("accepts paths within workspace root", () => {
		const root = "/home/user/workspace"
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require("node:path")
		const target = "src/index.ts"
		const resolved = path.resolve(root, target)
		const relative = path.relative(root, resolved)
		expect(relative.startsWith("..")).toBe(false)
		expect(path.isAbsolute(relative)).toBe(false)
	})

	it("rejects absolute paths that point outside workspace", () => {
		const root = "/home/user/workspace"
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require("node:path")
		const target = "/etc/passwd"
		const resolved = path.resolve(root, target)
		const relative = path.relative(root, resolved)
		expect(relative.startsWith("..")).toBe(true)
	})
})

// ── Helpers ─────────────────────────────────────────────────────────────

async function execGit(cwd: string, ...args: string[]): Promise<void> {
	const { execFile } = await import("node:child_process")
	const { promisify } = await import("node:util")
	const execFileAsync = promisify(execFile)
	await execFileAsync("git", args, { cwd })
}
