/**
 * Workspace Sandbox Tests
 *
 * Tests for workspace-scoped tool execution, lease validation,
 * filesystem constraints, terminal scoping, and git worktree isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"

const _logger = (..._a: unknown[]) => void 0

import fs from "node:fs"
import path from "node:path"
import os from "node:os"

import { EventBus } from "../events/bus.js"
import { CapabilityRegistry } from "../capabilities/registry.js"
import { LocalToolRuntime } from "../runtime/local-tool-runtime.js"
import { createCancellationToken } from "../tasks/cancellation.js"
import type {
	WorkspaceContext,
	ToolExecutionContext,
} from "../capabilities/types.js"
import { createToolId, createCapabilityId } from "../capabilities/types.js"
import { createWorkspaceId } from "../workspace/types.js"
import { WorkspaceManager } from "../workspace/manager.js"
import { CodeCapabilityAdapter } from "../../modules/code/capabilities/adapter.js"

// ── Helpers ─────────────────────────────────────────────────────────────

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "airi-sandbox-test-"))
}

function createTestRuntime(workspaceManager?: WorkspaceManager): {
	events: EventBus
	registry: CapabilityRegistry
	runtime: LocalToolRuntime
} {
	const events = new EventBus()
	const registry = new CapabilityRegistry()
	const runtime = new LocalToolRuntime(registry, events, undefined, workspaceManager)
	return { events, registry, runtime }
}

function createToolCtx(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
	return {
		taskId: "task-test" as any,
		cancellationToken: createCancellationToken().token,
		timeoutMs: 30_000,
		metadata: {},
		...overrides,
	}
}

// ── WorkspaceContext in ToolExecutionContext ────────────────────────────

describe("WorkspaceContext in ToolExecutionContext", () => {
	it("can be included in ToolExecutionContext", () => {
		const wsContext: WorkspaceContext = {
			workspaceId: createWorkspaceId("ws-1"),
			rootPath: "/tmp/workspace",
		}

		const ctx: ToolExecutionContext = {
			taskId: "task-1" as any,
			workspaceContext: wsContext,
			cancellationToken: createCancellationToken().token,
			timeoutMs: 30_000,
			metadata: {},
		}

		expect(ctx.workspaceContext).toBeDefined()
		expect(ctx.workspaceContext!.workspaceId).toBe("ws-1")
		expect(ctx.workspaceContext!.rootPath).toBe("/tmp/workspace")
	})

	it("is optional — existing code without workspace context still works", () => {
		const ctx: ToolExecutionContext = {
			taskId: "task-1" as any,
			cancellationToken: createCancellationToken().token,
			timeoutMs: 30_000,
			metadata: {},
		}

		expect(ctx.workspaceContext).toBeUndefined()
	})

	it("supports worktree path in workspace context", () => {
		const wsContext: WorkspaceContext = {
			workspaceId: createWorkspaceId("ws-1"),
			rootPath: "/tmp/workspace",
			worktreePath: "/tmp/workspace/.airi-worktrees/ws-1",
			leaseToken: "token-abc",
		}

		expect(wsContext.worktreePath).toBeDefined()
		expect(wsContext.leaseToken).toBe("token-abc")
	})
})

// ── Workspace-scoped tool execution ──────────────────────────────────────

describe("Workspace-scoped tool execution", () => {
	let basePath: string
	let manager: WorkspaceManager

	beforeEach(async () => {
		basePath = tmpDir()
		const events = new EventBus()
		manager = new WorkspaceManager({ basePath }, events)
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	it("validates lease before executing workspace-scoped tools", async () => {
		const { registry, runtime } = createTestRuntime(manager)

		// Register a test tool.
		const toolId = createToolId("test.tool")
		registry.register({
			id: toolId,
			name: "Test Tool",
			description: "A test tool",
			capabilityId: createCapabilityId("test"),
			tools: [{ id: toolId, name: "Test Tool", description: "A test tool", capabilityId: createCapabilityId("test"), inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
		})

		let handlerCalled = false
		runtime.registerHandler(toolId, async () => {
			handlerCalled = true
			return "ok"
		})

		// Create a workspace and lease it.
		const ws = await manager.createWorkspace({
			name: "lease-ws",
			rootPath: path.join(basePath, "ws"),
		})
		const lease = manager.leaseWorkspace(ws.id, "session-1")

		// Execute with valid workspace context.
		const ctx = createToolCtx({
			workspaceContext: {
				workspaceId: ws.id,
				rootPath: ws.rootPath,
				leaseToken: lease.leaseToken,
			},
		})

		const result = await runtime.execute(toolId, {}, ctx)
		expect(result.success).toBe(true)
		expect(handlerCalled).toBe(true)
	})

	it("rejects execution with invalid lease token", async () => {
		const { registry, runtime } = createTestRuntime(manager)

		const toolId = createToolId("test.tool")
		registry.register({
			id: toolId,
			name: "Test Tool",
			description: "A test tool",
			capabilityId: createCapabilityId("test"),
			tools: [{ id: toolId, name: "Test Tool", description: "A test tool", capabilityId: createCapabilityId("test"), inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
		})

		runtime.registerHandler(toolId, async () => "ok")

		const ws = await manager.createWorkspace({
			name: "lease-ws",
			rootPath: path.join(basePath, "ws"),
		})

		// Execute with invalid lease token.
		const ctx = createToolCtx({
			workspaceContext: {
				workspaceId: ws.id,
				rootPath: ws.rootPath,
				leaseToken: "invalid-token",
			},
		})

		const result = await runtime.execute(toolId, {}, ctx)
		expect(result.success).toBe(false)
		expect(result.error?.code).toBe("LEASE_INVALID")
	})

	it("executes without workspace context (backward compatibility)", async () => {
		const { registry, runtime } = createTestRuntime(manager)

		const toolId = createToolId("test.tool")
		registry.register({
			id: toolId,
			name: "Test Tool",
			description: "A test tool",
			capabilityId: createCapabilityId("test"),
			tools: [{ id: toolId, name: "Test Tool", description: "A test tool", capabilityId: createCapabilityId("test"), inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
		})

		runtime.registerHandler(toolId, async () => "ok")

		// No workspace context — should still work.
		const ctx = createToolCtx()

		const result = await runtime.execute(toolId, {}, ctx)
		expect(result.success).toBe(true)
	})

	it("executes without workspace manager (backward compatibility)", async () => {
		const { registry, runtime } = createTestRuntime(undefined)

		const toolId = createToolId("test.tool")
		registry.register({
			id: toolId,
			name: "Test Tool",
			description: "A test tool",
			capabilityId: createCapabilityId("test"),
			tools: [{ id: toolId, name: "Test Tool", description: "A test tool", capabilityId: createCapabilityId("test"), inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
		})

		runtime.registerHandler(toolId, async () => "ok")

		const ctx = createToolCtx({
			workspaceContext: {
				workspaceId: createWorkspaceId("ws-1"),
				rootPath: "/tmp/workspace",
			},
		})

		// No workspace manager — should still work (no lease validation).
		const result = await runtime.execute(toolId, {}, ctx)
		expect(result.success).toBe(true)
	})
})

// ── Filesystem constraint ───────────────────────────────────────────────

describe("Filesystem constraint", () => {
	it("validates paths within workspace root", () => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require("node:path")
		const root = "/home/user/workspace"

		// Valid path.
		const target1 = "src/index.ts"
		const resolved1 = path.resolve(root, target1)
		const relative1 = path.relative(root, resolved1)
		expect(relative1.startsWith("..")).toBe(false)

		// Invalid path — escapes workspace.
		const target2 = "../../etc/passwd"
		const resolved2 = path.resolve(root, target2)
		const relative2 = path.relative(root, resolved2)
		expect(relative2.startsWith("..")).toBe(true)
	})

	it("CodeCapabilityAdapter.validateWorkspacePath rejects traversal", () => {
		// The static method is available on the adapter.
		expect(CodeCapabilityAdapter.validateWorkspacePath("/workspace", "src/index.ts")).toBe(true)
		expect(CodeCapabilityAdapter.validateWorkspacePath("/workspace", "../etc/passwd")).toBe(false)
		expect(CodeCapabilityAdapter.validateWorkspacePath("/workspace", "/etc/passwd")).toBe(false)
	})
})

// ── Terminal scoping ────────────────────────────────────────────────────

describe("Terminal scoping", () => {
	it("resolves CWD to workspace root when no cwd specified", async () => {
		const { createTerminalCapability } = await import("../../modules/code/capabilities/terminal/terminal.module.js")
		const cap = createTerminalCapability({ workspaceRoot: "/tmp/workspace" })

		expect(cap.config?.workspaceRoot).toBe("/tmp/workspace")
	})

	it("rejects CWD that escapes workspace root", async () => {
		const { resolveTerminalCwd } = await import("../../modules/code/capabilities/terminal/terminal.module.js")

		const cwd = resolveTerminalCwd("/workspace", "../../etc")
		expect(cwd).toBe("/workspace")
	})

	it("accepts CWD within workspace root", async () => {
		const { resolveTerminalCwd } = await import("../../modules/code/capabilities/terminal/terminal.module.js")

		const cwd = resolveTerminalCwd("/workspace", "src")
		expect(cwd).toContain("src")
		expect(cwd).toContain("/workspace")
	})

	it("builds workspace environment variables", async () => {
		const { buildWorkspaceEnv } = await import("../../modules/code/capabilities/terminal/terminal.module.js")

		const env = buildWorkspaceEnv("/workspace", { NODE_ENV: "test" })
		expect(env.AIRI_WORKSPACE_ROOT).toBe("/workspace")
		expect(env.NODE_ENV).toBe("test")
	})
})

// ── Git worktree isolation ──────────────────────────────────────────────

describe("Git worktree isolation", () => {
	let repoPath: string

	beforeEach(async () => {
		repoPath = tmpDir()
		await execGit(repoPath, "init", "-b", "main")
		await execGit(repoPath, "config", "user.email", "test@test.com")
		await execGit(repoPath, "config", "user.name", "Test")
		fs.writeFileSync(path.join(repoPath, "README.md"), "# Test")
		await execGit(repoPath, "add", ".")
		await execGit(repoPath, "commit", "-m", "initial")
	})

	afterEach(async () => {
		fs.rmSync(repoPath, { recursive: true, force: true })
	})

	it("resolves git workdir to worktree path", async () => {
		const { resolveGitWorkdir } = await import("../../modules/code/capabilities/git/git.module.js")

		const worktreePath = "/workspace/.airi-worktrees/ws-1"
		const dir = resolveGitWorkdir("/workspace", worktreePath)
		expect(dir).toBe(worktreePath)
	})

	it("falls back to workspace root when no worktree", async () => {
		const { resolveGitWorkdir } = await import("../../modules/code/capabilities/git/git.module.js")

		const dir = resolveGitWorkdir("/workspace")
		expect(dir).toBe("/workspace")
	})

	it("asserts git operations target worktree, not primary repo", async () => {
		const { assertNotPrimaryRepo } = await import("../../modules/code/capabilities/git/git.module.js")

		expect(() => {
			assertNotPrimaryRepo("/repo", "/repo")
		}).toThrow("must target a worktree")

		// Should not throw for different paths.
		expect(() => {
			assertNotPrimaryRepo("/workspace/.airi-worktrees/ws-1", "/repo")
		}).not.toThrow()
	})

	it("creates git capability with worktree config", async () => {
		const { createGitCapability } = await import("../../modules/code/capabilities/git/git.module.js")

		const cap = createGitCapability({ worktreePath: "/workspace/.airi-worktrees/ws-1" })
		expect(cap.config?.worktreePath).toBe("/workspace/.airi-worktrees/ws-1")
	})
})

// ── Workspace manager integration with adapter ──────────────────────────

describe("Workspace manager integration", () => {
	let basePath: string

	beforeEach(() => {
		basePath = tmpDir()
	})

	afterEach(async () => {
		fs.rmSync(basePath, { recursive: true, force: true })
	})

	it("passes workspace manager to CodeCapabilityAdapter", () => {
		const events = new EventBus()
		const registry = new CapabilityRegistry()
		const manager = new WorkspaceManager({ basePath }, events)

		const adapter = new CodeCapabilityAdapter(registry, events, manager)
		expect(adapter.getWorkspaceManager()).toBe(manager)
	})

	it("adapter works without workspace manager", () => {
		const events = new EventBus()
		const registry = new CapabilityRegistry()

		const adapter = new CodeCapabilityAdapter(registry, events)
		expect(adapter.getWorkspaceManager()).toBeUndefined()
	})

	it("adapter registers capabilities", () => {
		const events = new EventBus()
		const registry = new CapabilityRegistry()

		const adapter = new CodeCapabilityAdapter(registry, events)
		adapter.registerCapabilities()

		expect(registry.hasTool(createToolId("code.read_file"))).toBe(true)
		expect(registry.hasTool(createToolId("code.list_files"))).toBe(true)
		expect(registry.hasTool(createToolId("code.search_files"))).toBe(true)
		expect(registry.hasTool(createToolId("code.apply_diff"))).toBe(true)
		expect(registry.hasTool(createToolId("code.execute_command"))).toBe(true)
	})
})

// ── Helpers ─────────────────────────────────────────────────────────────

async function execGit(cwd: string, ...args: string[]): Promise<void> {
	const { execFile } = await import("node:child_process")
	const { promisify } = await import("node:util")
	const execFileAsync = promisify(execFile)
	await execFileAsync("git", args, { cwd })
}
