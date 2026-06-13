/**
 * AIRI Core — Semantic Memory Layer
 *
 * Barrel export for the semantic memory system. Provides memory storage,
 * retrieval, repository intelligence, decision/failure memory, and
 * deterministic context assembly for cognition.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type {
	MemoryId,
	RetrievalId,
	RepositoryMapId,
	MemoryScope,
	MemoryType,
	MemoryRecord,
	MemoryReference,
	MemoryEmbedding,
	MemoryQuery,
	MemoryResult,
	RepositoryMap,
	ArchitectureNode,
	FileGraphNode,
	ImportEdge,
	GitMetadata,
	GitCommitInfo,
	DecisionRecord,
	FailureRecord,
	FailurePattern,
	RetrievalTrace,
	RetrievalContext,
} from "./types.js"

export {
	createMemoryId,
	createRetrievalId,
	createRepositoryMapId,
} from "./types.js"

// ── Implementations ──────────────────────────────────────────────────────

export { MemoryRegistry } from "./registry.js"
export { RepositoryIntelligence } from "./repository-map.js"
export { DecisionMemory } from "./decision-memory.js"
export { FailureMemory } from "./failure-memory.js"
export { MemoryRetriever } from "./retrieval.js"
