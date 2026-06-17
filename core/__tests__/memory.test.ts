/**
 * Semantic Memory Tests
 *
 * Tests for:
 * - Branded ID types (MemoryId, RetrievalId, RepositoryMapId)
 * - MemoryRegistry: register, get, query, update, remove, list, count, clear
 * - Query relevance scoring (deterministic)
 * - RepositoryIntelligence: indexRepository, findRelatedFiles, getDependencyChain, getAffectedFiles
 * - DecisionMemory: recordDecision, getDecisions, getDecisionStats, getOutcomes
 * - FailureMemory: recordFailure, getFailures, detectPatterns, getFailureStats
 * - MemoryRetriever: retrieveForContext, buildContextString, traceRetrieval
 * - Serialization round-trip for SerializedMemoryRecord, SerializedRetrievalTrace, SerializedRepositoryMap
 */

import { describe, it, expect, beforeEach } from "vitest"

const _logger = (..._a: unknown[]) => void 0

import {
	MemoryRegistry,
	RepositoryIntelligence,
	DecisionMemory,
	FailureMemory,
	MemoryRetriever,
	createMemoryId,
	createRetrievalId,
	createRepositoryMapId,
} from "../memory/index.js"
import type {
	MemoryRecord,
	MemoryReference,
	MemoryQuery,
	DecisionRecord,
	FailureRecord,
	SerializedMemoryRecord,
	SerializedRetrievalTrace,
	SerializedRepositoryMap,
} from "../memory/types.js"

// ── Helpers ──────────────────────────────────────────────────────────────

function createTestMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
	const id = createMemoryId(`mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
	const now = new Date().toISOString()
	return {
		id,
		scope: "global",
		type: "context",
		title: "Test Memory",
		content: "Test content for memory record",
		references: [],
		metadata: {},
		createdAt: now,
		updatedAt: now,
		importance: 0.5,
		accessCount: 0,
		...overrides,
	}
}

function createTestReference(overrides: Partial<MemoryReference> = {}): MemoryReference {
	return {
		type: "file",
		id: "test-file",
		path: "src/test.ts",
		description: "Test reference",
		...overrides,
	}
}

// Sample files using full relative paths for proper graph resolution.
const sampleFiles = [
	{
		path: "src/index.ts",
		content: "import { foo } from 'src/foo'\nimport { bar } from 'src/bar'\nexport const main = () => {}",
		size: 100,
		lastModified: "2024-01-01T00:00:00Z",
	},
	{
		path: "src/foo.ts",
		content: "import { helper } from 'src/helper'\nexport const foo = () => {}",
		size: 80,
		lastModified: "2024-01-01T00:00:00Z",
	},
	{
		path: "src/bar.ts",
		content: "export const bar = () => {}",
		size: 60,
		lastModified: "2024-01-01T00:00:00Z",
	},
	{
		path: "src/helper.ts",
		content: "export const helper = () => {}",
		size: 40,
		lastModified: "2024-01-01T00:00:00Z",
	},
]

// ── Branded ID tests ─────────────────────────────────────────────────────

describe("Branded IDs", () => {
	it("creates MemoryId from raw string", () => {
		const id = createMemoryId("test-mem-001")
		expect(id).toBe("test-mem-001")
	})

	it("creates RetrievalId from raw string", () => {
		const id = createRetrievalId("test-retr-001")
		expect(id).toBe("test-retr-001")
	})

	it("creates RepositoryMapId from raw string", () => {
		const id = createRepositoryMapId("test-repo-001")
		expect(id).toBe("test-repo-001")
	})
})

// ── MemoryRegistry tests ─────────────────────────────────────────────────

describe("MemoryRegistry", () => {
	let registry: MemoryRegistry

	beforeEach(() => {
		registry = new MemoryRegistry()
	})

	it("registers and retrieves a memory record", () => {
		const record = createTestMemory()
		registry.register(record)

		const retrieved = registry.get(record.id)
		expect(retrieved).toBeDefined()
		expect(retrieved!.id).toBe(record.id)
		expect(retrieved!.title).toBe("Test Memory")
	})

	it("store is an alias for register", () => {
		const record = createTestMemory()
		const result = registry.store(record)

		expect(result).toBe(record)
		expect(registry.get(record.id)).toBeDefined()
	})

	it("returns undefined for non-existent ID", () => {
		const id = createMemoryId("non-existent")
		expect(registry.get(id)).toBeUndefined()
	})

	it("updates a memory record", () => {
		const record = createTestMemory()
		registry.register(record)

		const updated = registry.update(record.id, { title: "Updated Title", importance: 0.9 })
		expect(updated).toBeDefined()
		expect(updated!.title).toBe("Updated Title")
		expect(updated!.importance).toBe(0.9)
		expect(updated!.content).toBe("Test content for memory record") // Preserved.
	})

	it("returns undefined when updating non-existent record", () => {
		const id = createMemoryId("non-existent")
		expect(registry.update(id, { title: "X" })).toBeUndefined()
	})

	it("removes a memory record", () => {
		const record = createTestMemory()
		registry.register(record)

		expect(registry.remove(record.id)).toBe(true)
		expect(registry.get(record.id)).toBeUndefined()
	})

	it("returns false when removing non-existent record", () => {
		const id = createMemoryId("non-existent")
		expect(registry.remove(id)).toBe(false)
	})

	it("lists all records", () => {
		registry.register(createTestMemory({ id: createMemoryId("mem-1"), title: "First" }))
		registry.register(createTestMemory({ id: createMemoryId("mem-2"), title: "Second" }))

		const records = registry.list()
		expect(records).toHaveLength(2)
	})

	it("lists records filtered by scope", () => {
		registry.register(createTestMemory({ id: createMemoryId("mem-1"), scope: "global" }))
		registry.register(createTestMemory({ id: createMemoryId("mem-2"), scope: "workspace" }))
		registry.register(createTestMemory({ id: createMemoryId("mem-3"), scope: "global" }))

		const globalRecords = registry.list({ scopes: ["global"] })
		expect(globalRecords).toHaveLength(2)
	})

	it("lists records filtered by type", () => {
		registry.register(createTestMemory({ id: createMemoryId("mem-1"), type: "decision" }))
		registry.register(createTestMemory({ id: createMemoryId("mem-2"), type: "failure" }))
		registry.register(createTestMemory({ id: createMemoryId("mem-3"), type: "decision" }))

		const decisions = registry.list({ types: ["decision"] })
		expect(decisions).toHaveLength(2)
	})

	it("counts records", () => {
		expect(registry.count()).toBe(0)

		registry.register(createTestMemory({ id: createMemoryId("mem-1") }))
		expect(registry.count()).toBe(1)

		registry.register(createTestMemory({ id: createMemoryId("mem-2") }))
		expect(registry.count()).toBe(2)
	})

	it("clears all records", () => {
		registry.register(createTestMemory({ id: createMemoryId("mem-1") }))
		registry.register(createTestMemory({ id: createMemoryId("mem-2") }))

		registry.clear()
		expect(registry.count()).toBe(0)
	})

	it("increments access count", () => {
		const record = createTestMemory({ accessCount: 0 })
		registry.register(record)

		registry.incrementAccess(record.id)

		const updated = registry.get(record.id)!
		expect(updated.accessCount).toBe(1)
		expect(updated.lastAccessedAt).toBeDefined()
	})

	it("finds records by reference", () => {
		const ref = createTestReference({ type: "file", id: "test-file" })
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			references: [ref],
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			references: [],
		}))

		const found = registry.getByReference(ref)
		expect(found).toHaveLength(1)
		expect(found[0]!.id).toBe(createMemoryId("mem-1"))
	})

	it("finds records by scope target", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			scope: "workspace",
			workspaceId: "ws-1",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			scope: "workspace",
			workspaceId: "ws-2",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-3"),
			scope: "global",
		}))

		const ws1Records = registry.getByScope("workspace", "ws-1")
		expect(ws1Records).toHaveLength(1)
		expect(ws1Records[0]!.id).toBe(createMemoryId("mem-1"))
	})

	it("generates unique IDs", () => {
		const id1 = registry.generateId()
		const id2 = registry.generateId()
		expect(id1).not.toBe(id2)
	})
})

// ── Query relevance scoring tests ─────────────────────────────────────────

describe("Query relevance scoring", () => {
	let registry: MemoryRegistry

	beforeEach(() => {
		registry = new MemoryRegistry()
	})

	it("scores exact text match highest", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Fix authentication middleware",
			content: "JWT refresh token implementation",
			importance: 0.8,
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			title: "Unrelated topic",
			content: "Something else entirely",
			importance: 0.5,
		}))

		const results = registry.query({ text: "authentication" })
		expect(results.length).toBeGreaterThanOrEqual(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
		expect(results[0]!.relevanceScore).toBeGreaterThan(results[1]?.relevanceScore ?? 0)
	})

	it("boosts score for reference overlap", () => {
		const ref = createTestReference({ type: "file", id: "auth-middleware" })
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Auth middleware",
			content: "Authentication middleware fix",
			references: [ref],
			importance: 0.5,
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			title: "Auth middleware",
			content: "Authentication middleware fix",
			references: [],
			importance: 0.5,
		}))

		const results = registry.query({
			text: "auth",
			references: [ref],
		})

		const mem1Result = results.find((r) => r.record.id === createMemoryId("mem-1"))
		const mem2Result = results.find((r) => r.record.id === createMemoryId("mem-2"))

		expect(mem1Result).toBeDefined()
		expect(mem2Result).toBeDefined()
		expect(mem1Result!.relevanceScore).toBeGreaterThan(mem2Result!.relevanceScore)
	})

	it("boosts score for scope match", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Test",
			content: "Test content",
			scope: "workspace",
			importance: 0.5,
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			title: "Test",
			content: "Test content",
			scope: "global",
			importance: 0.5,
		}))

		const results = registry.query({
			text: "test",
			scopes: ["workspace"],
		})

		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("boosts score for type match", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Test",
			content: "Test content",
			type: "decision",
			importance: 0.5,
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			title: "Test",
			content: "Test content",
			type: "failure",
			importance: 0.5,
		}))

		const results = registry.query({
			text: "test",
			types: ["decision"],
		})

		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("applies importance weighting", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "High importance",
			content: "Test content",
			importance: 1.0,
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			title: "Low importance",
			content: "Test content",
			importance: 0.0,
		}))

		const results = registry.query({ text: "test" })

		const highResult = results.find((r) => r.record.id === createMemoryId("mem-1"))
		const lowResult = results.find((r) => r.record.id === createMemoryId("mem-2"))

		expect(highResult).toBeDefined()
		expect(lowResult).toBeDefined()
		expect(highResult!.relevanceScore).toBeGreaterThan(lowResult!.relevanceScore)
	})

	it("applies maxResults limit", () => {
		for (let i = 0; i < 10; i += 1) {
			registry.register(createTestMemory({
				id: createMemoryId(`mem-${i}`),
				title: `Memory ${i}`,
				content: "Test content",
			}))
		}

		const results = registry.query({ text: "memory", maxResults: 3 })
		expect(results).toHaveLength(3)
	})

	it("filters by workspaceId", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			workspaceId: "ws-1",
			title: "Test",
			content: "Test content",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			workspaceId: "ws-2",
			title: "Test",
			content: "Test content",
		}))

		const results = registry.query({ workspaceId: "ws-1" })
		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("filters by minImportance", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			importance: 0.8,
			title: "Test",
			content: "Test content",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			importance: 0.2,
			title: "Test",
			content: "Test content",
		}))

		const results = registry.query({ minImportance: 0.5 })
		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("filters by sinceTimestamp", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			createdAt: "2024-01-01T00:00:00Z",
			title: "Old",
			content: "Test content",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			createdAt: "2024-06-01T00:00:00Z",
			title: "New",
			content: "Test content",
		}))

		const results = registry.query({ sinceTimestamp: "2024-03-01T00:00:00Z" })
		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-2"))
	})

	it("returns matchType 'exact' for text match", () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Authentication fix",
			content: "JWT refresh",
		}))

		const results = registry.query({ text: "authentication" })
		expect(results[0]!.matchType).toBe("exact")
	})

	it("returns matchType 'reference' for reference match", () => {
		const ref = createTestReference({ type: "file", id: "test" })
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Test",
			content: "Content",
			references: [ref],
		}))

		const results = registry.query({ references: [ref] })
		expect(results[0]!.matchType).toBe("reference")
	})
})

// ── RepositoryIntelligence tests ──────────────────────────────────────────

describe("RepositoryIntelligence", () => {
	let intelligence: RepositoryIntelligence

	beforeEach(() => {
		intelligence = new RepositoryIntelligence()
	})

	it("indexes a repository", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		expect(map.id).toBeDefined()
		expect(map.repositoryPath).toBe("/test/repo")
		expect(map.fileGraph.length).toBe(4)
		expect(map.rootNodes.length).toBeGreaterThan(0)
	})

	it("gets a map by ID", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		const retrieved = intelligence.getMap(map.id)
		expect(retrieved).toBeDefined()
		expect(retrieved!.id).toBe(map.id)
	})

	it("lists all maps", async () => {
		await intelligence.indexRepository("/test/repo1", { files: sampleFiles })
		await intelligence.indexRepository("/test/repo2", { files: sampleFiles })

		const maps = intelligence.listMaps()
		expect(maps).toHaveLength(2)
	})

	it("removes a map", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		expect(intelligence.removeMap(map.id)).toBe(true)
		expect(intelligence.getMap(map.id)).toBeUndefined()
	})

	it("finds related files via BFS", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		const related = intelligence.findRelatedFiles(map.id, "src/index.ts")
		expect(related.length).toBeGreaterThan(0)
		// Should find foo.ts and bar.ts (direct imports).
		const paths = related.map((f) => f.path)
		expect(paths).toContain("src/foo.ts")
		expect(paths).toContain("src/bar.ts")
	})

	it("gets dependency chain", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		const chain = intelligence.getDependencyChain(map.id, "src/index.ts")
		expect(chain.length).toBeGreaterThan(0)
		expect(chain).toContain("src/index.ts")
	})

	it("gets affected files (reverse dependencies)", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		const affected = intelligence.getAffectedFiles(map.id, ["src/helper.ts"])
		expect(affected).toContain("src/foo.ts")
	})

	it("gets file context", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: sampleFiles,
		})

		const context = intelligence.getFileContext(map.id, "src/index.ts")
		expect(context.file).toBeDefined()
		expect(context.file!.path).toBe("src/index.ts")
		expect(context.imports).toContain("src/foo")
		expect(context.imports).toContain("src/bar")
	})

	it("returns empty context for unknown file", () => {
		const context = intelligence.getFileContext(createRepositoryMapId("nonexistent"), "unknown.ts")
		expect(context.file).toBeUndefined()
		expect(context.imports).toHaveLength(0)
	})

	it("parses TypeScript imports", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: [
				{
					path: "src/app.ts",
					content: "import { helper } from './utils/helper'\nimport { config } from '../config'",
					size: 100,
					lastModified: "2024-01-01T00:00:00Z",
				},
			],
		})

		const appNode = map.fileGraph.find((f) => f.path === "src/app.ts")
		expect(appNode).toBeDefined()
		expect(appNode!.imports).toContain("./utils/helper")
		expect(appNode!.imports).toContain("../config")
	})

	it("parses Python imports", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: [
				{
					path: "src/main.py",
					content: "import os\nfrom utils import helper\nfrom . import config",
					size: 100,
					lastModified: "2024-01-01T00:00:00Z",
				},
			],
		})

		const mainNode = map.fileGraph.find((f) => f.path === "src/main.py")
		expect(mainNode).toBeDefined()
		expect(mainNode!.imports).toContain("os")
		// "from utils import helper" captures "utils" as the module path.
		expect(mainNode!.imports).toContain("utils")
	})

	it("identifies test files", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: [
				{
					path: "src/app.ts",
					content: "export const app = {}",
					size: 50,
					lastModified: "2024-01-01T00:00:00Z",
				},
				{
					path: "src/app.test.ts",
					content: "import { app } from './app'",
					size: 50,
					lastModified: "2024-01-01T00:00:00Z",
				},
			],
		})

		const testNode = map.fileGraph.find((f) => f.path === "src/app.test.ts")
		expect(testNode!.isTest).toBe(true)

		const srcNode = map.fileGraph.find((f) => f.path === "src/app.ts")
		expect(srcNode!.isTest).toBe(false)
	})

	it("identifies config files", async () => {
		const map = await intelligence.indexRepository("/test/repo", {
			files: [
				{
					path: "tsconfig.json",
					content: '{"compilerOptions": {}}',
					size: 50,
					lastModified: "2024-01-01T00:00:00Z",
				},
			],
		})

		const configNode = map.fileGraph.find((f) => f.path === "tsconfig.json")
		expect(configNode!.isConfig).toBe(true)
	})
})

// ── DecisionMemory tests ─────────────────────────────────────────────────

describe("DecisionMemory", () => {
	let memory: DecisionMemory

	beforeEach(() => {
		memory = new DecisionMemory()
	})

	it("records a decision", () => {
		const id = createMemoryId("dec-1")
		const decision: DecisionRecord = {
			id,
			type: "accepted",
			title: "Use JWT for auth",
			reasoning: "Industry standard, well-supported",
			timestamp: new Date().toISOString(),
		}

		memory.recordDecision(decision)
		expect(memory.getDecisions()).toHaveLength(1)
	})

	it("gets decisions filtered by proposalId", () => {
		const id1 = createMemoryId("dec-1")
		const id2 = createMemoryId("dec-2")

		memory.recordDecision({
			id: id1,
			proposalId: "prop-1",
			type: "accepted",
			title: "Decision 1",
			reasoning: "Reasoning 1",
			timestamp: new Date().toISOString(),
		})
		memory.recordDecision({
			id: id2,
			proposalId: "prop-2",
			type: "rejected",
			title: "Decision 2",
			reasoning: "Reasoning 2",
			timestamp: new Date().toISOString(),
		})

		const prop1Decisions = memory.getDecisions({ proposalId: "prop-1" })
		expect(prop1Decisions).toHaveLength(1)
		expect(prop1Decisions[0]!.title).toBe("Decision 1")
	})

	it("gets decisions filtered by type", () => {
		memory.recordDecision({
			id: createMemoryId("dec-1"),
			type: "accepted",
			title: "Accepted",
			reasoning: "Reasoning",
			timestamp: new Date().toISOString(),
		})
		memory.recordDecision({
			id: createMemoryId("dec-2"),
			type: "rejected",
			title: "Rejected",
			reasoning: "Reasoning",
			timestamp: new Date().toISOString(),
		})

		const accepted = memory.getDecisions({ type: "accepted" })
		expect(accepted).toHaveLength(1)
		expect(accepted[0]!.title).toBe("Accepted")
	})

	it("gets decision stats", () => {
		memory.recordDecision({
			id: createMemoryId("dec-1"),
			type: "accepted",
			title: "A",
			reasoning: "R",
			timestamp: new Date().toISOString(),
		})
		memory.recordDecision({
			id: createMemoryId("dec-2"),
			type: "accepted",
			title: "B",
			reasoning: "R",
			timestamp: new Date().toISOString(),
		})
		memory.recordDecision({
			id: createMemoryId("dec-3"),
			type: "rejected",
			title: "C",
			reasoning: "R",
			timestamp: new Date().toISOString(),
		})
		memory.recordDecision({
			id: createMemoryId("dec-4"),
			type: "revised",
			title: "D",
			reasoning: "R",
			timestamp: new Date().toISOString(),
		})

		const stats = memory.getDecisionStats()
		expect(stats.total).toBe(4)
		expect(stats.accepted).toBe(2)
		expect(stats.rejected).toBe(1)
		expect(stats.revised).toBe(1)
	})

	it("gets outcomes for a proposal", () => {
		const id1 = createMemoryId("dec-1")
		memory.recordDecision({
			id: id1,
			proposalId: "prop-1",
			type: "accepted",
			title: "Decision with outcome",
			reasoning: "Reasoning",
			outcome: "Successfully implemented",
			timestamp: new Date().toISOString(),
		})

		const outcomes = memory.getOutcomes("prop-1")
		expect(outcomes).toHaveLength(1)
		expect(outcomes[0]!.outcome).toBe("Successfully implemented")
	})

	it("gets validation history", () => {
		memory.recordDecision({
			id: createMemoryId("dec-1"),
			proposalId: "prop-1",
			type: "accepted",
			title: "Validated decision",
			reasoning: "Reasoning",
			validationResult: {
				valid: true,
				errors: [],
				warnings: ["Minor warning"],
			},
			timestamp: new Date().toISOString(),
		})

		const history = memory.getValidationHistory("prop-1")
		expect(history).toHaveLength(1)
		expect(history[0]!.validationResult!.valid).toBe(true)
	})

	it("updates a decision with outcome", () => {
		const id = createMemoryId("dec-1")
		memory.recordDecision({
			id,
			type: "accepted",
			title: "Decision",
			reasoning: "Reasoning",
			timestamp: new Date().toISOString(),
		})

		const updated = memory.updateDecision(id, "Deployed successfully")
		expect(updated).toBeDefined()
		expect(updated!.outcome).toBe("Deployed successfully")
	})

	it("counts and clears decisions", () => {
		expect(memory.count()).toBe(0)

		memory.recordDecision({
			id: createMemoryId("dec-1"),
			type: "accepted",
			title: "Test",
			reasoning: "R",
			timestamp: new Date().toISOString(),
		})
		expect(memory.count()).toBe(1)

		memory.clear()
		expect(memory.count()).toBe(0)
	})

	it("generates unique IDs", () => {
		const id1 = memory.generateId()
		const id2 = memory.generateId()
		expect(id1).not.toBe(id2)
	})
})

// ── FailureMemory tests ──────────────────────────────────────────────────

describe("FailureMemory", () => {
	let memory: FailureMemory

	beforeEach(() => {
		memory = new FailureMemory()
	})

	it("records a failure", () => {
		const id = createMemoryId("fail-1")
		const failure: FailureRecord = {
			id,
			type: "execution",
			error: "Connection timeout",
			context: "Connecting to database",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		}

		memory.recordFailure(failure)
		expect(memory.getFailures()).toHaveLength(1)
	})

	it("gets failures filtered by type", () => {
		memory.recordFailure({
			id: createMemoryId("fail-1"),
			type: "execution",
			error: "Timeout",
			context: "Database",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})
		memory.recordFailure({
			id: createMemoryId("fail-2"),
			type: "validation",
			error: "Schema mismatch",
			context: "Input validation",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})

		const execFailures = memory.getFailures({ type: "execution" })
		expect(execFailures).toHaveLength(1)
		expect(execFailures[0]!.error).toBe("Timeout")
	})

	it("gets failures filtered by taskId", () => {
		memory.recordFailure({
			id: createMemoryId("fail-1"),
			taskId: "task-1",
			type: "execution",
			error: "Error 1",
			context: "Context 1",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})
		memory.recordFailure({
			id: createMemoryId("fail-2"),
			taskId: "task-2",
			type: "execution",
			error: "Error 2",
			context: "Context 2",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})

		const task1Failures = memory.getFailures({ taskId: "task-1" })
		expect(task1Failures).toHaveLength(1)
	})

	it("detects recurring patterns", () => {
		// Record 3 failures with the same error signature.
		for (let i = 0; i < 3; i += 1) {
			memory.recordFailure({
				id: createMemoryId(`fail-${i}`),
				type: "execution",
				error: "Connection timeout after 5000ms",
				context: `Attempt ${i}`,
				recoveryAttempted: false,
				timestamp: new Date().toISOString(),
			})
		}

		const patterns = memory.detectPatterns()
		expect(patterns.length).toBeGreaterThan(0)

		const timeoutPattern = patterns.find((p) => p.type === "timeout")
		expect(timeoutPattern).toBeDefined()
		expect(timeoutPattern!.occurrences).toBe(3)
		expect(timeoutPattern!.suggestedAction).toBeDefined()
	})

	it("does not create patterns for fewer than 3 occurrences", () => {
		memory.recordFailure({
			id: createMemoryId("fail-1"),
			type: "execution",
			error: "Unique error",
			context: "Context",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})
		memory.recordFailure({
			id: createMemoryId("fail-2"),
			type: "execution",
			error: "Unique error",
			context: "Context",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})

		const patterns = memory.detectPatterns()
		expect(patterns).toHaveLength(0)
	})

	it("gets a pattern by ID", () => {
		for (let i = 0; i < 3; i += 1) {
			memory.recordFailure({
				id: createMemoryId(`fail-${i}`),
				type: "execution",
				error: "Permission denied: /path/to/file",
				context: `Attempt ${i}`,
				recoveryAttempted: false,
				timestamp: new Date().toISOString(),
			})
		}

		const patterns = memory.detectPatterns()
		expect(patterns.length).toBeGreaterThan(0)

		const patternId = patterns[0]!.id
		const pattern = memory.getPattern(patternId)
		expect(pattern).toBeDefined()
		expect(pattern!.type).toBe("permission")
	})

	it("gets suggested action for a pattern", () => {
		for (let i = 0; i < 3; i += 1) {
			memory.recordFailure({
				id: createMemoryId(`fail-${i}`),
				type: "execution",
				error: "Permission denied",
				context: `Attempt ${i}`,
				recoveryAttempted: false,
				timestamp: new Date().toISOString(),
			})
		}

		const patterns = memory.detectPatterns()
		const action = memory.getSuggestedAction(patterns[0]!.id)
		expect(action).toBeDefined()
		expect(action).toContain("permission")
	})

	it("gets failure stats", () => {
		memory.recordFailure({
			id: createMemoryId("fail-1"),
			type: "execution",
			error: "Error 1",
			context: "Context 1",
			recoveryAttempted: true,
			timestamp: new Date().toISOString(),
		})
		memory.recordFailure({
			id: createMemoryId("fail-2"),
			type: "validation",
			error: "Error 2",
			context: "Context 2",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})
		memory.recordFailure({
			id: createMemoryId("fail-3"),
			type: "execution",
			error: "Error 3",
			context: "Context 3",
			recoveryAttempted: true,
			timestamp: new Date().toISOString(),
		})

		const stats = memory.getFailureStats()
		expect(stats.total).toBe(3)
		expect(stats.byType.execution).toBe(2)
		expect(stats.byType.validation).toBe(1)
		expect(stats.withRecovery).toBe(2)
	})

	it("counts and clears failures", () => {
		expect(memory.count()).toBe(0)

		memory.recordFailure({
			id: createMemoryId("fail-1"),
			type: "execution",
			error: "Error",
			context: "Context",
			recoveryAttempted: false,
			timestamp: new Date().toISOString(),
		})
		expect(memory.count()).toBe(1)

		memory.clear()
		expect(memory.count()).toBe(0)
	})

	it("generates unique IDs", () => {
		const id1 = memory.generateId()
		const id2 = memory.generateId()
		expect(id1).not.toBe(id2)
	})
})

// ── MemoryRetriever tests ────────────────────────────────────────────────

describe("MemoryRetriever", () => {
	let registry: MemoryRegistry
	let retriever: MemoryRetriever

	beforeEach(() => {
		registry = new MemoryRegistry()
		retriever = new MemoryRetriever(registry)
	})

	it("retrieves for context", async () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			title: "Auth fix",
			content: "JWT refresh implementation",
			importance: 0.8,
		}))

		const context = await retriever.retrieveForContext({
			text: "auth",
			maxResults: 5,
		})

		expect(context.results.length).toBeGreaterThan(0)
		expect(context.contextString).toContain("Semantic Memory Context")
		expect(context.trace).toBeDefined()
	})

	it("builds context string", () => {
		const results = [
			{
				record: createTestMemory({
					id: createMemoryId("mem-1"),
					type: "decision",
					title: "Auth fix",
					content: "JWT refresh",
					importance: 0.8,
				}),
				relevanceScore: 0.95,
				matchType: "exact" as const,
			},
		]

		const contextString = retriever.buildContextString(results)
		expect(contextString).toContain("Semantic Memory Context")
		expect(contextString).toContain("Relevant Memories")
		expect(contextString).toContain("Auth fix")
	})

	it("builds context string with max length", () => {
		const results = [
			{
				record: createTestMemory({
					id: createMemoryId("mem-1"),
					title: "A very long title that should be truncated eventually because it exceeds the maximum length",
					content: "Content",
					importance: 0.5,
				}),
				relevanceScore: 0.5,
				matchType: "exact" as const,
			},
		]

		const contextString = retriever.buildContextString(results, 50)
		// The truncation adds "\n... (truncated)" (16 chars) to the 50-char slice.
		expect(contextString.length).toBeLessThanOrEqual(70)
		expect(contextString).toContain("truncated")
	})

	it("traces retrieval", () => {
		const query: MemoryQuery = { text: "test", maxResults: 5 }
		const results: unknown[] = []
		const contextString = "## Semantic Memory Context"

		const trace = retriever.traceRetrieval(query, results, contextString, "req-123")

		expect(trace.id).toBeDefined()
		expect(trace.query).toBe(query)
		expect(trace.results).toBe(results)
		expect(trace.contextUsed).toBe(contextString)
		expect(trace.requestId).toBe("req-123")
		expect(trace.timestamp).toBeDefined()
	})

	it("retrieves workspace-scoped memories", async () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			scope: "workspace",
			workspaceId: "ws-1",
			title: "Workspace memory",
			content: "Content",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			scope: "workspace",
			workspaceId: "ws-2",
			title: "Other workspace",
			content: "Content",
		}))

		const results = await retriever.retrieveForWorkspace("ws-1")
		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("retrieves repository-scoped memories", async () => {
		registry.register(createTestMemory({
			id: createMemoryId("mem-1"),
			scope: "repository",
			repositoryId: "repo-1",
			title: "Repo memory",
			content: "Content",
		}))
		registry.register(createTestMemory({
			id: createMemoryId("mem-2"),
			scope: "repository",
			repositoryId: "repo-2",
			title: "Other repo",
			content: "Content",
		}))

		const results = await retriever.retrieveForRepository("repo-1")
		expect(results).toHaveLength(1)
		expect(results[0]!.record.id).toBe(createMemoryId("mem-1"))
	})

	it("increments access counts on retrieval", async () => {
		const record = createTestMemory({ accessCount: 0 })
		registry.register(record)

		await retriever.retrieveForContext({ text: "test" })

		const updated = registry.get(record.id)!
		expect(updated.accessCount).toBeGreaterThan(0)
	})
})

// ── Serialization round-trip tests ────────────────────────────────────────

describe("Serialization round-trip", () => {
	it("serializes and deserializes SerializedMemoryRecord", () => {
		const record: SerializedMemoryRecord = {
			id: "mem-123",
			scope: "workspace",
			type: "decision",
			title: "Test Decision",
			content: "This is a test decision record",
			references: [
				{ type: "file", id: "src/test.ts", path: "src/test.ts", description: "Test file" },
			],
			metadata: { key: "value" },
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
			sessionId: "sess-1",
			workspaceId: "ws-1",
			importance: 0.8,
			accessCount: 5,
			lastAccessedAt: "2024-01-03T00:00:00Z",
		}

		// Serialize to JSON and back.
		const json = JSON.stringify(record)
		const deserialized: SerializedMemoryRecord = JSON.parse(json)

		expect(deserialized.id).toBe(record.id)
		expect(deserialized.scope).toBe(record.scope)
		expect(deserialized.type).toBe(record.type)
		expect(deserialized.title).toBe(record.title)
		expect(deserialized.content).toBe(record.content)
		expect(deserialized.references).toHaveLength(1)
		expect(deserialized.references[0]!.type).toBe("file")
		expect(deserialized.metadata.key).toBe("value")
		expect(deserialized.importance).toBe(0.8)
		expect(deserialized.accessCount).toBe(5)
	})

	it("serializes and deserializes SerializedRetrievalTrace", () => {
		const trace: SerializedRetrievalTrace = {
			id: "retr-456",
			queryText: "authentication",
			resultCount: 3,
			timestamp: "2024-01-01T00:00:00Z",
			durationMs: 15,
		}

		const json = JSON.stringify(trace)
		const deserialized: SerializedRetrievalTrace = JSON.parse(json)

		expect(deserialized.id).toBe(trace.id)
		expect(deserialized.queryText).toBe(trace.queryText)
		expect(deserialized.resultCount).toBe(trace.resultCount)
		expect(deserialized.durationMs).toBe(15)
	})

	it("serializes and deserializes SerializedRepositoryMap", () => {
		const map: SerializedRepositoryMap = {
			id: "repo-789",
			repositoryPath: "/test/repo",
			name: "test-repo",
			fileCount: 42,
			importEdgeCount: 15,
			branch: "main",
			commit: "abc123def456",
			indexedAt: "2024-01-01T00:00:00Z",
			lastUpdated: "2024-01-01T00:00:00Z",
		}

		const json = JSON.stringify(map)
		const deserialized: SerializedRepositoryMap = JSON.parse(json)

		expect(deserialized.id).toBe(map.id)
		expect(deserialized.repositoryPath).toBe(map.repositoryPath)
		expect(deserialized.fileCount).toBe(42)
		expect(deserialized.importEdgeCount).toBe(15)
		expect(deserialized.branch).toBe("main")
		expect(deserialized.commit).toBe("abc123def456")
	})
})
