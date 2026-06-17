/**
 * Memory Event Type Tests
 *
 * Tests for:
 * - All 8 new event types are in the AiriEvent union
 * - Event emission for memory operations
 */

import { describe, it, expect } from "vitest"
import type {
	AiriEvent,
	MemoryStored,
	MemoryRetrieved,
	MemoryUpdated,
	MemoryRemoved,
	RepositoryIndexed,
	DecisionRecorded,
	FailureRecorded,
	FailurePatternDetected,
} from "../events/types.js"
import { createMemoryId, createRepositoryMapId } from "../memory/types.js"

// ── Event type verification ──────────────────────────────────────────────

describe("Memory event types in AiriEvent union", () => {
	it("MemoryStored has correct type discriminant", () => {
		const event: MemoryStored = {
			type: "memory.stored",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-registry",
			memoryId: createMemoryId("mem-123"),
			scope: "workspace",
			memoryType: "decision",
			title: "Test Memory",
		}

		// Verify it's assignable to AiriEvent.
		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("memory.stored")
	})

	it("MemoryRetrieved has correct type discriminant", () => {
		const event: MemoryRetrieved = {
			type: "memory.retrieved",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-retriever",
			resultCount: 5,
			queryText: "authentication",
			requestId: "req-123",
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("memory.retrieved")
	})

	it("MemoryUpdated has correct type discriminant", () => {
		const event: MemoryUpdated = {
			type: "memory.updated",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-registry",
			memoryId: createMemoryId("mem-123"),
			title: "Updated Title",
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("memory.updated")
	})

	it("MemoryRemoved has correct type discriminant", () => {
		const event: MemoryRemoved = {
			type: "memory.removed",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-registry",
			memoryId: createMemoryId("mem-123"),
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("memory.removed")
	})

	it("RepositoryIndexed has correct type discriminant", () => {
		const event: RepositoryIndexed = {
			type: "repository.indexed",
			timestamp: "2024-01-01T00:00:00Z",
			source: "repository-scanner",
			mapId: createRepositoryMapId("repo-123"),
			repositoryPath: "/test/repo",
			filesIndexed: 42,
			importEdges: 15,
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("repository.indexed")
	})

	it("DecisionRecorded has correct type discriminant", () => {
		const event: DecisionRecorded = {
			type: "decision.recorded",
			timestamp: "2024-01-01T00:00:00Z",
			source: "decision-memory",
			memoryId: createMemoryId("mem-123"),
			decisionType: "accepted",
			proposalId: "prop-123",
			title: "Test Decision",
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("decision.recorded")
	})

	it("FailureRecorded has correct type discriminant", () => {
		const event: FailureRecorded = {
			type: "failure.recorded",
			timestamp: "2024-01-01T00:00:00Z",
			source: "failure-memory",
			memoryId: createMemoryId("mem-123"),
			failureType: "execution",
			error: "Connection timeout",
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("failure.recorded")
	})

	it("FailurePatternDetected has correct type discriminant", () => {
		const event: FailurePatternDetected = {
			type: "failure.pattern.detected",
			timestamp: "2024-01-01T00:00:00Z",
			source: "failure-memory",
			patternId: "pattern-timeout",
			patternType: "timeout",
			occurrences: 5,
			suggestedAction: "Increase timeout",
		}

		const airiEvent: AiriEvent = event
		expect(airiEvent.type).toBe("failure.pattern.detected")
	})
})

// ── Event payload verification ───────────────────────────────────────────

describe("Memory event payloads", () => {
	it("MemoryStored carries memory metadata", () => {
		const event: MemoryStored = {
			type: "memory.stored",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-registry",
			memoryId: createMemoryId("mem-001"),
			scope: "workspace",
			memoryType: "decision",
			title: "Use JWT for auth",
		}

		expect(event.memoryId).toBe("mem-001")
		expect(event.scope).toBe("workspace")
		expect(event.memoryType).toBe("decision")
		expect(event.title).toBe("Use JWT for auth")
	})

	it("MemoryRetrieved carries query metadata", () => {
		const event: MemoryRetrieved = {
			type: "memory.retrieved",
			timestamp: "2024-01-01T00:00:00Z",
			source: "memory-retriever",
			resultCount: 3,
			queryText: "authentication",
			requestId: "req-456",
		}

		expect(event.resultCount).toBe(3)
		expect(event.queryText).toBe("authentication")
		expect(event.requestId).toBe("req-456")
	})

	it("RepositoryIndexed carries indexing metadata", () => {
		const event: RepositoryIndexed = {
			type: "repository.indexed",
			timestamp: "2024-01-01T00:00:00Z",
			source: "repository-scanner",
			mapId: createRepositoryMapId("repo-789"),
			repositoryPath: "/projects/myapp",
			filesIndexed: 150,
			importEdges: 320,
		}

		expect(event.filesIndexed).toBe(150)
		expect(event.importEdges).toBe(320)
		expect(event.repositoryPath).toBe("/projects/myapp")
	})

	it("DecisionRecorded carries decision metadata", () => {
		const event: DecisionRecorded = {
			type: "decision.recorded",
			timestamp: "2024-01-01T00:00:00Z",
			source: "cognition-coordinator",
			memoryId: createMemoryId("mem-002"),
			decisionType: "rejected",
			proposalId: "prop-789",
			title: "Migrate to microservices",
		}

		expect(event.decisionType).toBe("rejected")
		expect(event.proposalId).toBe("prop-789")
		expect(event.title).toBe("Migrate to microservices")
	})

	it("FailureRecorded carries failure metadata", () => {
		const event: FailureRecorded = {
			type: "failure.recorded",
			timestamp: "2024-01-01T00:00:00Z",
			source: "failure-memory",
			memoryId: createMemoryId("mem-003"),
			failureType: "workspace",
			error: "Workspace corruption on concurrent access",
		}

		expect(event.failureType).toBe("workspace")
		expect(event.error).toContain("corruption")
	})

	it("FailurePatternDetected carries pattern metadata", () => {
		const event: FailurePatternDetected = {
			type: "failure.pattern.detected",
			timestamp: "2024-01-01T00:00:00Z",
			source: "failure-memory",
			patternId: "pattern-timeout-001",
			patternType: "timeout",
			occurrences: 5,
			suggestedAction: "Increase timeout or implement retry",
		}

		expect(event.occurrences).toBe(5)
		expect(event.suggestedAction).toContain("timeout")
	})
})

// ── Event narrowing ───────────────────────────────────────────────────────

describe("Event narrowing via type field", () => {
	it("narrows MemoryStored from AiriEvent", () => {
		const event: AiriEvent = {
			type: "memory.stored",
			timestamp: "2024-01-01T00:00:00Z",
			source: "test",
			memoryId: createMemoryId("mem-001"),
			scope: "global",
			memoryType: "context",
			title: "Test",
		}

		if (event.type === "memory.stored") {
			// TypeScript should narrow to MemoryStored.
			expect(event.memoryId).toBe("mem-001")
			expect(event.scope).toBe("global")
		} else {
			throw new Error("Expected memory.stored type")
		}
	})

	it("narrows FailurePatternDetected from AiriEvent", () => {
		const event: AiriEvent = {
			type: "failure.pattern.detected",
			timestamp: "2024-01-01T00:00:00Z",
			source: "test",
			patternId: "p1",
			patternType: "timeout",
			occurrences: 3,
		}

		if (event.type === "failure.pattern.detected") {
			expect(event.occurrences).toBe(3)
			expect(event.patternType).toBe("timeout")
		} else {
			throw new Error("Expected failure.pattern.detected type")
		}
	})
})
