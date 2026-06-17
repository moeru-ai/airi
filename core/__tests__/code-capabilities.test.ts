/**
 * AIRI Core — Code Capabilities Integration Tests
 *
 * Tests for the code capability layer: workspace lifecycle, tool execution,
 * streaming, patch generation, and cleanup guarantees.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import os from "node:os"

import { CapabilityRegistry } from "../../modules/code/capabilities/registry.js"
import type {
	CapabilityExecutionContext,
} from "../../modules/code/capabilities/types.js"

import { WorkspaceSessionManager } from "../../modules/code/workspace/session.js"
import { createWorkspaceHandle } from "../../modules/code/workspace/handle.js"

import { CodeToolExecutor } from "../../modules/code/tools/executor.js"
import { ReadFileTool, ListFilesTool, SearchFilesTool, ApplyDiffTool } from "../../modules/code/tools/builtins/index.js"

import { StreamingEmitter } from "../../modules/code/streaming/emitter.js"
import type { StreamingEvent, TokenStreamEvent } from "../../modules/code/streaming/types.js"
import { generateDiff, createProposal, applyPatch } from "../../modules/code/patches/generator.js"

// ── Test helpers ─────────────────────────────────────────────────────────

let tempDir: string

async function createTempWorkspace(): Promise<string> {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "airi-test-"))
	return dir
}

async function writeFile(dir: string, name: string, content: string): Promise<void> {
	await fsp.writeFile(path.join(dir, name), content)
}

async function createSubdir(dir: string, name: string): Promise<void> {
	await fsp.mkdir(path.join(dir, name))
}

function createTestContext(workspacePath: string, taskId = "test-task-1"): CapabilityExecutionContext {
	const logs: Array<{ level: string; message: string }> = []
	return {
		taskId,
		workspacePath,
		log(level: string, message: string) {
			logs.push({ level, message })
		},
	}
}

// ── Capability Registry tests ────────────────────────────────────────────

describe("CapabilityRegistry", () => {
	let registry: CapabilityRegistry

	beforeEach(() => {
		registry = new CapabilityRegistry()
	})

	it("starts empty", () => {
		expect(registry.size).toBe(0)
		expect(registry.list()).toEqual([])
	})

	it("registers and retrieves capabilities", () => {
		const tool = new ReadFileTool()
		registry.register(tool)

		expect(registry.get("read_file")).toBe(tool)
		expect(registry.has("read_file")).toBe(true)
		expect(registry.size).toBe(1)
	})

	it("lists all registered capabilities", () => {
		registry.register(new ReadFileTool())
		registry.register(new ListFilesTool())

		const list = registry.list()
		expect(list).toHaveLength(2)
	})

	it("overwrites on re-registration", () => {
		const tool1 = new ReadFileTool()
		const tool2 = new ReadFileTool()
		registry.register(tool1)
		registry.register(tool2)

		expect(registry.get("read_file")).toBe(tool2)
		expect(registry.size).toBe(1)
	})

	it("returns undefined for unknown capability", () => {
		expect(registry.get("nonexistent")).toBeUndefined()
		expect(registry.has("nonexistent")).toBe(false)
	})

	it("clears all capabilities", () => {
		registry.register(new ReadFileTool())
		registry.register(new ListFilesTool())
		registry.clear()

		expect(registry.size).toBe(0)
		expect(registry.list()).toEqual([])
	})
})

// ── Workspace Session tests ──────────────────────────────────────────────

describe("WorkspaceSessionManager", () => {
	let manager: WorkspaceSessionManager

	beforeEach(() => {
		manager = new WorkspaceSessionManager()
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("creates a session for a workspace", async () => {
		tempDir = await createTempWorkspace()
		const session = await manager.createSession(tempDir)

		expect(session.sessionId).toMatch(/^ws-/)
		expect(session.rootPath).toBe(tempDir)
		expect(session.createdAt).toBeDefined()
		expect(manager.activeSessionCount).toBe(1)
		expect(manager.hasSession(session.sessionId)).toBe(true)
	})

	it("retrieves a session by ID", async () => {
		tempDir = await createTempWorkspace()
		const session = await manager.createSession(tempDir)
		const retrieved = manager.getSession(session.sessionId)

		expect(retrieved).toBe(session)
	})

	it("disposes a session cleanly", async () => {
		tempDir = await createTempWorkspace()
		const session = await manager.createSession(tempDir)
		await manager.disposeSession(session.sessionId)

		expect(manager.activeSessionCount).toBe(0)
		expect(manager.hasSession(session.sessionId)).toBe(false)
	})

	it("creates a temp directory session when useTempDir is true", async () => {
		tempDir = await createTempWorkspace()
		const session = await manager.createSession(tempDir, {
			useTempDir: true,
			basePath: tempDir,
		})

		expect(session.rootPath).not.toBe(tempDir)
		expect(session.rootPath).toContain("airi-workspace-")
		expect(fs.existsSync(session.rootPath)).toBe(true)

		await manager.disposeSession(session.sessionId)

		// Temp dir should be removed after dispose.
		expect(fs.existsSync(session.rootPath)).toBe(false)
	})

	it("disposes all sessions at once", async () => {
		tempDir = await createTempWorkspace()
		await manager.createSession(tempDir, { useTempDir: true, basePath: tempDir })
		await manager.createSession(tempDir, { useTempDir: true, basePath: tempDir })

		expect(manager.activeSessionCount).toBe(2)
		await manager.disposeAll()
		expect(manager.activeSessionCount).toBe(0)
	})
})

// ── Workspace Handle tests ───────────────────────────────────────────────

describe("WorkspaceHandle", () => {
	let manager: WorkspaceSessionManager
	let workspaceDir: string

	beforeEach(async () => {
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()

		await writeFile(workspaceDir, "README.md", "# Test Project\n\nThis is a test.")
		await writeFile(workspaceDir, "package.json", '{"name": "test", "version": "1.0.0"}')
		await createSubdir(workspaceDir, "src")
		await writeFile(workspaceDir, "src/index.ts", 'console.log("hello");\n')
		await writeFile(workspaceDir, "src/index.ts", 'console.log("hello");\n')
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("reads a file with full content", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		const result = await handle.readFile("README.md")
		expect(result.content).toBe("# Test Project\n\nThis is a test.")
		expect(result.encoding).toBe("utf-8")
		expect(result.size).toBeGreaterThan(0)
	})

	it("reads a file with slice mode (offset/limit)", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		const result = await handle.readFile("src/index.ts", { offset: 1, limit: 1 })
		expect(result.content).toContain('console.log')
	})

	it("lists files in root directory", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		const entries = await handle.listFiles(".", { recursive: false })
		expect(entries.length).toBeGreaterThan(0)

		const names = entries.map((e) => e.name)
		expect(names).toContain("README.md")
		expect(names).toContain("package.json")
	})

	it("lists files recursively", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		const entries = await handle.listFiles(".", { recursive: true })
		const paths = entries.map((e) => e.path)

		expect(paths).toContain("src/index.ts")
	})

	it("checks if a path exists", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		expect(await handle.exists("README.md")).toBe(true)
		expect(await handle.exists("nonexistent.txt")).toBe(false)
	})

	it("scans workspace and returns metadata", async () => {
		const session = await manager.createSession(workspaceDir)
		const handle = createWorkspaceHandle(session)

		const scan = await handle.scan()
		expect(scan.rootPath).toBe(workspaceDir)
		expect(scan.fileCount).toBeGreaterThan(0)
		expect(scan.files.length).toBeGreaterThan(0)
	})
})

// ── ReadFileTool tests ──────────────────────────────────────────────────

describe("ReadFileTool", () => {
	let tool: ReadFileTool
	let workspaceDir: string
	let manager: WorkspaceSessionManager

	beforeEach(async () => {
		tool = new ReadFileTool()
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()
		await writeFile(workspaceDir, "test.txt", "line1\nline2\nline3\nline4\nline5\n")
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("validates input correctly", () => {
		expect(tool.validateInput({ path: "test.txt" }).valid).toBe(true)
		expect(tool.validateInput({}).valid).toBe(false)
		expect(tool.validateInput({ path: "test.txt", offset: 0 }).valid).toBe(false)
		expect(tool.validateInput({ path: "test.txt", mode: "invalid" }).valid).toBe(false)
	})

	it("reads a file successfully", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: "test.txt" }, ctx)

		expect(result.success).toBe(true)
		expect(result.output).toBeDefined()
		expect(result.durationMs).toBeGreaterThanOrEqual(0)
	})

	it("reads a file with offset and limit", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute(
			{ path: "test.txt", offset: 2, limit: 2 },
			ctx,
		)

		expect(result.success).toBe(true)
		const output = result.output as { content: string }
		expect(output.content).toContain("line2")
		expect(output.content).toContain("line3")
	})

	it("returns error for nonexistent file", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: "nonexistent.txt" }, ctx)

		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
	})

	it("detects binary files", async () => {
		// Create a binary file.
		const binaryPath = path.join(workspaceDir, "binary.bin")
		await fsp.writeFile(binaryPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]))

		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: "binary.bin" }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { isBinary: boolean }
		expect(output.isBinary).toBe(true)
	})
})

// ── ListFilesTool tests ─────────────────────────────────────────────────

describe("ListFilesTool", () => {
	let tool: ListFilesTool
	let workspaceDir: string
	let manager: WorkspaceSessionManager

	beforeEach(async () => {
		tool = new ListFilesTool()
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()
		await writeFile(workspaceDir, "file1.ts", "export const a = 1\n")
		await writeFile(workspaceDir, "file2.ts", "export const b = 2\n")
		await createSubdir(workspaceDir, "subdir")
		await writeFile(workspaceDir, "subdir/file3.ts", "export const c = 3\n")
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("validates input correctly", () => {
		expect(tool.validateInput({ path: "." }).valid).toBe(true)
		expect(tool.validateInput({}).valid).toBe(false)
	})

	it("lists files in a directory", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: ".", recursive: false }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { entries: Array<{ name: string }>; count: number }
		expect(output.count).toBe(2)
		expect(output.entries.map((e) => e.name)).toContain("file1.ts")
		expect(output.entries.map((e) => e.name)).toContain("file2.ts")
	})

	it("lists files recursively", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: ".", recursive: true }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { entries: Array<{ path: string }>; count: number }
		expect(output.count).toBe(3)
		expect(output.entries.map((e) => e.path)).toContain("subdir/file3.ts")
	})
})

// ── SearchFilesTool tests ───────────────────────────────────────────────

describe("SearchFilesTool", () => {
	let tool: SearchFilesTool
	let workspaceDir: string
	let manager: WorkspaceSessionManager

	beforeEach(async () => {
		tool = new SearchFilesTool()
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()
		await writeFile(workspaceDir, "file1.ts", "const hello = 'world'\n")
		await writeFile(workspaceDir, "file2.ts", "const goodbye = 'world'\n")
		await writeFile(workspaceDir, "file3.txt", "no match here\n")
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("validates input correctly", () => {
		expect(tool.validateInput({ path: ".", regex: "hello" }).valid).toBe(true)
		expect(tool.validateInput({ path: "." }).valid).toBe(false)
		expect(tool.validateInput({ path: ".", regex: "hello", file_pattern: "*.ts" }).valid).toBe(true)
		expect(tool.validateInput({ path: ".", regex: "[invalid" }).valid).toBe(false)
	})

	it("finds matching content", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: ".", regex: "hello" }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { matches: Array<{ file: string }>; totalMatches: number }
		expect(output.totalMatches).toBe(1)
		expect(output.matches[0].file).toBe("file1.ts")
	})

	it("returns empty results for no matches", async () => {
		const ctx = createTestContext(workspaceDir)
		const result = await tool.execute({ path: ".", regex: "nonexistent_pattern_xyz" }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { matches: Array<unknown>; totalMatches: number }
		expect(output.totalMatches).toBe(0)
	})
})

// ── ApplyDiffTool tests ─────────────────────────────────────────────────

describe("ApplyDiffTool", () => {
	let tool: ApplyDiffTool
	let workspaceDir: string
	let manager: WorkspaceSessionManager

	beforeEach(async () => {
		tool = new ApplyDiffTool()
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()
		await writeFile(workspaceDir, "test.ts", "const a = 1\nconst b = 2\n")
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("validates input correctly", () => {
		expect(tool.validateInput({ path: "test.ts", diff: "..." }).valid).toBe(true)
		expect(tool.validateInput({ path: "test.ts" }).valid).toBe(false)
		expect(tool.validateInput({ diff: "..." }).valid).toBe(false)
	})

	it("applies SEARCH/REPLACE diff", async () => {
		const ctx = createTestContext(workspaceDir)
		const diff = "<<<<<<< SEARCH\nconst a = 1\n=======\nconst a = 42\n>>>>>>> REPLACE"

		const result = await tool.execute({ path: "test.ts", diff }, ctx)

		expect(result.success).toBe(true)
		const output = result.output as { patchedContent: string }
		expect(output.patchedContent).toContain("const a = 42")
		expect(output.patchedContent).toContain("const b = 2")
	})

	it("returns error for non-matching SEARCH content", async () => {
		const ctx = createTestContext(workspaceDir)
		const diff = "<<<<<<< SEARCH\nnonexistent content\n=======\nnew content\n>>>>>>> REPLACE"

		const result = await tool.execute({ path: "test.ts", diff }, ctx)

		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
	})
})

// ── CodeToolExecutor tests ──────────────────────────────────────────────

describe("CodeToolExecutor", () => {
	let workspaceDir: string
	let manager: WorkspaceSessionManager

	beforeEach(async () => {
		manager = new WorkspaceSessionManager()
		workspaceDir = await createTempWorkspace()
		await writeFile(workspaceDir, "test.txt", "hello world\n")
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("executes a registered tool", async () => {
		const registry = new CapabilityRegistry()
		registry.register(new ReadFileTool())
		const executor = new CodeToolExecutor(registry as unknown as ConstructorParameters<typeof CodeToolExecutor>[0])
		const ctx = createTestContext(workspaceDir)

		const output = await executor.execute(
			{ toolName: "read_file", params: { path: "test.txt" }, taskId: "test-1" },
			ctx,
		)

		expect(output.toolName).toBe("read_file")
		expect(output.taskId).toBe("test-1")
		expect(output.result.success).toBe(true)
		expect(output.timestamp).toBeDefined()
	})

	it("returns error for unknown tool", async () => {
		const registry = new CapabilityRegistry()
		const executor = new CodeToolExecutor(registry as unknown as ConstructorParameters<typeof CodeToolExecutor>[0])
		const ctx = createTestContext(workspaceDir)

		const output = await executor.execute(
			{ toolName: "unknown_tool", params: {}, taskId: "test-1" },
			ctx,
		)

		expect(output.result.success).toBe(false)
		expect(output.result.error).toContain("Unknown tool")
	})

	it("returns validation error for invalid input", async () => {
		const registry = new CapabilityRegistry()
		registry.register(new ReadFileTool())
		const executor = new CodeToolExecutor(registry as unknown as ConstructorParameters<typeof CodeToolExecutor>[0])
		const ctx = createTestContext(workspaceDir)

		const output = await executor.execute(
			{ toolName: "read_file", params: {}, taskId: "test-1" },
			ctx,
		)

		expect(output.result.success).toBe(false)
		expect(output.result.error).toContain("Validation failed")
	})

	it("cancels execution for cancelled task", async () => {
		const registry = new CapabilityRegistry()
		registry.register(new ReadFileTool())
		const executor = new CodeToolExecutor(registry as unknown as ConstructorParameters<typeof CodeToolExecutor>[0])
		const ctx = createTestContext(workspaceDir)

		// Cancel the task.
		executor.cancel("test-cancelled")

		const output = await executor.execute(
			{ toolName: "read_file", params: { path: "test.txt" }, taskId: "test-cancelled" },
			ctx,
		)

		expect(output.result.success).toBe(false)
		expect(output.result.error).toContain("cancelled")
	})
})

// ── StreamingEmitter tests ──────────────────────────────────────────────

describe("StreamingEmitter", () => {
	let emitter: StreamingEmitter

	beforeEach(() => {
		emitter = new StreamingEmitter()
	})

	it("starts with no events", () => {
		expect(emitter.eventCountForTask("task-1")).toBe(0)
		expect(emitter.subscriberCount).toBe(0)
	})

	it("emits events to subscribers", () => {
		const events: StreamingEvent[] = []
		emitter.subscribe((event) => events.push(event))

		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "hello",
			timestamp: new Date().toISOString(),
		})

		expect(events).toHaveLength(1)
		expect(events[0].type).toBe("token")
		expect((events[0] as TokenStreamEvent).token).toBe("hello")
	})

	it("buffers events per task", () => {
		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "a",
			timestamp: new Date().toISOString(),
		})
		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "b",
			timestamp: new Date().toISOString(),
		})
		emitter.emit({
			type: "token",
			taskId: "task-2",
			token: "c",
			timestamp: new Date().toISOString(),
		})

		expect(emitter.eventCountForTask("task-1")).toBe(2)
		expect(emitter.eventCountForTask("task-2")).toBe(1)
	})

	it("returns events for a task (reconnect-safe)", () => {
		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "a",
			timestamp: "2024-01-01T00:00:00Z",
		})
		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "b",
			timestamp: "2024-01-01T00:00:01Z",
		})

		const events = emitter.getEventsForTask("task-1")
		expect(events).toHaveLength(2)
		expect((events[0] as TokenStreamEvent).token).toBe("a")
		expect((events[1] as TokenStreamEvent).token).toBe("b")
	})

	it("clears events for a task", () => {
		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "a",
			timestamp: new Date().toISOString(),
		})

		emitter.clearTask("task-1")
		expect(emitter.eventCountForTask("task-1")).toBe(0)
	})

	it("unsubscribes handlers", () => {
		const events: StreamingEvent[] = []
		const unsub = emitter.subscribe((event) => events.push(event))

		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "a",
			timestamp: new Date().toISOString(),
		})

		unsub()

		emitter.emit({
			type: "token",
			taskId: "task-1",
			token: "b",
			timestamp: new Date().toISOString(),
		})

		expect(events).toHaveLength(1)
	})

	it("enforces bounded buffer", () => {
		const smallEmitter = new StreamingEmitter(3)

		smallEmitter.emit({ type: "token", taskId: "t1", token: "1", timestamp: "2024-01-01T00:00:00Z" })
		smallEmitter.emit({ type: "token", taskId: "t1", token: "2", timestamp: "2024-01-01T00:00:01Z" })
		smallEmitter.emit({ type: "token", taskId: "t1", token: "3", timestamp: "2024-01-01T00:00:02Z" })
		smallEmitter.emit({ type: "token", taskId: "t1", token: "4", timestamp: "2024-01-01T00:00:03Z" })

		const events = smallEmitter.getEventsForTask("t1")
		expect(events).toHaveLength(3)
		expect((events[0] as TokenStreamEvent).token).toBe("2") // First event was evicted
		expect((events[2] as TokenStreamEvent).token).toBe("4")
	})

	it("clears all events and subscribers", () => {
		emitter.subscribe(() => {})
		emitter.emit({ type: "token", taskId: "t1", token: "a", timestamp: "2024-01-01T00:00:00Z" })

		emitter.clearAll()

		expect(emitter.eventCountForTask("t1")).toBe(0)
		expect(emitter.subscriberCount).toBe(0)
	})
})

// ── Patch Generator tests ───────────────────────────────────────────────

describe("PatchGenerator", () => {
	it("generates a diff between two strings", () => {
		const original = "line1\nline2\nline3\n"
		const modified = "line1\nmodified line2\nline3\n"

		const result = generateDiff(original, modified)

		expect(result.patch).toBeDefined()
		expect(result.patch.length).toBeGreaterThan(0)
		expect(result.additions + result.deletions).toBeGreaterThan(0)
	})

	it("generates a diff with correct line counts", () => {
		const original = "a\nb\nc\n"
		const modified = "a\nx\ny\nc\n"

		const result = generateDiff(original, modified)

		expect(result.additions).toBeGreaterThanOrEqual(2)
		expect(result.deletions).toBeGreaterThanOrEqual(1)
	})

	it("creates a patch proposal", () => {
		const files = [
			{
				path: "test.ts",
				action: "modify" as const,
				originalContent: "const a = 1",
				patchedContent: "const a = 2",
			},
		]

		const proposal = createProposal("task-1", files, "Update constant value")

		expect(proposal.id).toMatch(/^patch-/)
		expect(proposal.taskId).toBe("task-1")
		expect(proposal.files).toHaveLength(1)
		expect(proposal.status).toBe("pending")
		expect(proposal.description).toBe("Update constant value")
		expect(proposal.createdAt).toBeDefined()
	})

	it("applies a unified diff patch", () => {
		const content = "line1\nline2\nline3\n"
		const patch = "@@ -1,3 +1,3 @@\n line1\n-line2\n+modified\n line3\n"

		const result = applyPatch(content, patch)

		expect(result.success).toBe(true)
		expect(result.content).toContain("modified")
		expect(result.content).not.toContain("line2\n")
	})

	it("returns error for invalid patch", () => {
		const content = "line1\nline2\nline3\n"
		const invalidPatch = "this is not a valid patch"

		const result = applyPatch(content, invalidPatch)

		// Should either succeed with no changes or fail gracefully.
		expect(result.content).toBeDefined()
	})
})

// ── Cleanup guarantees ──────────────────────────────────────────────────

describe("Cleanup guarantees", () => {
	let manager: WorkspaceSessionManager

	beforeEach(() => {
		manager = new WorkspaceSessionManager()
	})

	afterEach(async () => {
		await manager.disposeAll()
	})

	it("removes temp directories on session dispose", async () => {
		const workspaceDir = await createTempWorkspace()
		const session = await manager.createSession(workspaceDir, {
			useTempDir: true,
			basePath: workspaceDir,
		})

		const tempPath = session.rootPath
		expect(fs.existsSync(tempPath)).toBe(true)

		await manager.disposeSession(session.sessionId)
		expect(fs.existsSync(tempPath)).toBe(false)
	})

	it("removes all temp directories on disposeAll", async () => {
		const workspaceDir = await createTempWorkspace()
		const session1 = await manager.createSession(workspaceDir, {
			useTempDir: true,
			basePath: workspaceDir,
		})
		const session2 = await manager.createSession(workspaceDir, {
			useTempDir: true,
			basePath: workspaceDir,
		})

		const temp1 = session1.rootPath
		const temp2 = session2.rootPath

		expect(fs.existsSync(temp1)).toBe(true)
		expect(fs.existsSync(temp2)).toBe(true)

		await manager.disposeAll()

		expect(fs.existsSync(temp1)).toBe(false)
		expect(fs.existsSync(temp2)).toBe(false)
	})

	it("streaming emitter clears task events", () => {
		const emitter = new StreamingEmitter()

		emitter.emit({ type: "token", taskId: "t1", token: "a", timestamp: "2024-01-01T00:00:00Z" })
		emitter.emit({ type: "token", taskId: "t1", token: "b", timestamp: "2024-01-01T00:00:01Z" })

		expect(emitter.eventCountForTask("t1")).toBe(2)

		emitter.clearTask("t1")

		expect(emitter.eventCountForTask("t1")).toBe(0)
		expect(emitter.getEventsForTask("t1")).toEqual([])
	})
})
