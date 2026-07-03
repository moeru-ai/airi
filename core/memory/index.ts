/**
 * AIRI Core — Semantic Memory Layer
 *
 * Barrel export for the semantic memory system. Provides memory storage,
 * retrieval, repository intelligence, decision/failure memory, and
 * deterministic context assembly for cognition.
 */

// ── Types ────────────────────────────────────────────────────────────────

export { DecisionMemory } from './decision-memory.js'

export { FailureMemory } from './failure-memory.js'

// ── Implementations ──────────────────────────────────────────────────────

export { MemoryRegistry } from './registry.js'
export { RepositoryIntelligence } from './repository-map.js'
export { MemoryRetriever } from './retrieval.js'
export type {
  ArchitectureNode,
  DecisionRecord,
  FailurePattern,
  FailureRecord,
  FileGraphNode,
  GitCommitInfo,
  GitMetadata,
  ImportEdge,
  MemoryEmbedding,
  MemoryId,
  MemoryQuery,
  MemoryRecord,
  MemoryReference,
  MemoryResult,
  MemoryScope,
  MemoryType,
  RepositoryMap,
  RepositoryMapId,
  RetrievalContext,
  RetrievalId,
  RetrievalTrace,
} from './types.js'
export {
  createMemoryId,
  createRepositoryMapId,
  createRetrievalId,
} from './types.js'
