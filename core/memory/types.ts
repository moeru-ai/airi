/**
 * AIRI Core — Semantic Memory Types
 *
 * Branded types and serializable interfaces for the semantic memory system.
 * Memory is explicit and deterministic — no AI/autonomous reasoning.
 *
 * Design principles:
 * - Branded IDs for type safety (MemoryId, RetrievalId, RepositoryMapId).
 * - All structures are serializable — no hidden state.
 * - Deterministic relevance scoring for retrieval.
 * - Optional embedding field for provider-generated vectors.
 */

// ── Branded IDs ──────────────────────────────────────────────────────────

/**
 * Opaque memory record identifier.
 *
 * Created via createMemoryId() to ensure brand safety at creation sites.
 */
export type MemoryId = string & { readonly __brand: 'MemoryId' }

/**
 * Opaque retrieval trace identifier.
 *
 * Created via createRetrievalId() to ensure brand safety at creation sites.
 */
export type RetrievalId = string & { readonly __brand: 'RetrievalId' }

/**
 * Opaque repository map identifier.
 *
 * Created via createRepositoryMapId() to ensure brand safety at creation sites.
 */
export type RepositoryMapId = string & { readonly __brand: 'RepositoryMapId' }

/**
 * Create a branded MemoryId from a raw string.
 */
export function createMemoryId(raw: string): MemoryId {
  return raw as MemoryId
}

/**
 * Create a branded RetrievalId from a raw string.
 */
export function createRetrievalId(raw: string): RetrievalId {
  return raw as RetrievalId
}

/**
 * Create a branded RepositoryMapId from a raw string.
 */
export function createRepositoryMapId(raw: string): RepositoryMapId {
  return raw as RepositoryMapId
}

// ── Memory scopes ─────────────────────────────────────────────────────────

/**
 * Scope determines the visibility and lifecycle of a memory record.
 */
export type MemoryScope = 'global' | 'session' | 'workspace' | 'repository'

/**
 * Memory type categorizes the kind of knowledge stored.
 */
export type MemoryType = 'decision' | 'failure' | 'architecture' | 'pattern' | 'context'

// ── Core memory record ────────────────────────────────────────────────────

/**
 * A single semantic memory record.
 *
 * Records are immutable after creation. Updates create new records via
 * the registry's update method (which replaces in-place for efficiency).
 */
export interface MemoryRecord {
  /** Unique memory identifier. */
  readonly id: MemoryId

  /** Scope determines visibility and lifecycle. */
  readonly scope: MemoryScope

  /** Type categorizes the kind of knowledge. */
  readonly type: MemoryType

  /** Human-readable title. */
  readonly title: string

  /** Detailed content (structured text). */
  readonly content: string

  /** Deterministic references to code/artifacts. */
  readonly references: MemoryReference[]

  /** Arbitrary metadata (serializable). */
  readonly metadata: Record<string, unknown>

  /** ISO-8601 creation timestamp. */
  readonly createdAt: string

  /** ISO-8601 last-update timestamp. */
  readonly updatedAt: string

  /** Associated session, if scope is 'session'. */
  readonly sessionId?: string

  /** Associated workspace, if scope is 'workspace'. */
  readonly workspaceId?: string

  /** Associated repository, if scope is 'repository'. */
  readonly repositoryId?: string

  /** Optional provider-generated embedding vector. */
  readonly embedding?: MemoryEmbedding

  /** Explicit importance score (0-1). */
  readonly importance: number

  /** Number of times this record has been accessed. */
  readonly accessCount: number

  /** ISO-8601 last access timestamp. */
  readonly lastAccessedAt?: string
}

// ── Reference types ───────────────────────────────────────────────────────

/**
 * Deterministic reference to a code artifact.
 *
 * Used to link memory records to specific files, modules, capabilities,
 * plans, tasks, or steps. References are resolved at retrieval time.
 */
export interface MemoryReference {
  /** The type of artifact being referenced. */
  readonly type: 'file' | 'module' | 'capability' | 'plan' | 'task' | 'step' | 'workspace' | 'repository'

  /** The ID of the referenced artifact. */
  readonly id: string

  /** Optional filesystem path. */
  readonly path?: string

  /** Why this reference matters. */
  readonly description?: string
}

// ── Embedding ─────────────────────────────────────────────────────────────

/**
 * Opaque embedding vector (provider-specific).
 *
 * Populated by the embedding provider, not generated autonomously.
 */
export interface MemoryEmbedding {
  /** Model that generated this embedding. */
  readonly model: string

  /** Vector dimensionality. */
  readonly dimensions: number

  /** Float32 embedding values. */
  readonly vector: number[]
}

// ── Query types ───────────────────────────────────────────────────────────

/**
 * Query parameters for memory retrieval.
 *
 * All fields are optional — an empty query returns all records
 * (subject to maxResults).
 */
export interface MemoryQuery {
  /** Free-text search string. */
  readonly text?: string

  /** Filter by scope. */
  readonly scopes?: MemoryScope[]

  /** Filter by type. */
  readonly types?: MemoryType[]

  /** Filter by workspace. */
  readonly workspaceId?: string

  /** Filter by repository. */
  readonly repositoryId?: string

  /** Filter by session. */
  readonly sessionId?: string

  /** Filter by reference overlap. */
  readonly references?: MemoryReference[]

  /** Maximum number of results. */
  readonly maxResults?: number

  /** Minimum importance threshold (0-1). */
  readonly minImportance?: number

  /** Only return records created after this ISO-8601 timestamp. */
  readonly sinceTimestamp?: string
}

/**
 * A single memory query result with relevance scoring.
 */
export interface MemoryResult {
  /** The matched memory record. */
  readonly record: MemoryRecord

  /**
   * Deterministic relevance score (0-1).
   *
   * Computed by the registry's scoring algorithm:
   * exact match (1.0) + reference overlap (+0.3 each) + scope match (+0.2)
   * + type match (+0.1) * importance weighting + recency boost (+0.1)
   * + access frequency (+0.05 * min(accessCount, 10)).
   */
  readonly relevanceScore: number

  /** How this result matched the query. */
  readonly matchType: 'exact' | 'semantic' | 'reference' | 'temporal'
}

// ── Repository map types ──────────────────────────────────────────────────

/**
 * A structural map of a repository for intelligence queries.
 */
export interface RepositoryMap {
  /** Unique repository map identifier. */
  readonly id: RepositoryMapId

  /** Absolute path to the repository root. */
  readonly repositoryPath: string

  /** Human-readable repository name. */
  readonly name: string

  /** Optional description. */
  readonly description?: string

  /** Top-level architecture nodes. */
  readonly rootNodes: ArchitectureNode[]

  /** File-level graph nodes. */
  readonly fileGraph: FileGraphNode[]

  /** Import relationship edges. */
  readonly importGraph: ImportEdge[]

  /** Git metadata at indexing time. */
  readonly gitMetadata: GitMetadata

  /** ISO-8601 indexing timestamp. */
  readonly indexedAt: string

  /** ISO-8601 last update timestamp. */
  readonly lastUpdated: string
}

/**
 * An architecture node represents a structural unit in the codebase.
 */
export interface ArchitectureNode {
  /** Node identifier. */
  readonly id: string

  /** Human-readable name. */
  readonly name: string

  /** Node classification. */
  readonly type: 'module' | 'component' | 'service' | 'config' | 'test' | 'utility' | 'entry'

  /** Filesystem path. */
  readonly path: string

  /** Child node IDs. */
  readonly children: string[]

  /** Node IDs this depends on. */
  readonly dependencies: string[]

  /** Capability IDs associated with this node. */
  readonly capabilities: string[]

  /** Optional description. */
  readonly description?: string
}

/**
 * A file-level node in the repository graph.
 */
export interface FileGraphNode {
  /** Relative file path. */
  readonly path: string

  /** File name. */
  readonly name: string

  /** File extension. */
  readonly extension: string

  /** File size in bytes. */
  readonly size: number

  /** ISO-8601 last modification timestamp. */
  readonly lastModified: string

  /** Paths this file imports. */
  readonly imports: string[]

  /** Paths that import this file. */
  readonly importedBy: string[]

  /** Whether this is a test file. */
  readonly isTest: boolean

  /** Whether this is a config file. */
  readonly isConfig: boolean
}

/**
 * An import relationship between two files.
 */
export interface ImportEdge {
  /** Source file path. */
  readonly from: string

  /** Imported file path. */
  readonly to: string

  /** Whether the import is an external dependency. */
  readonly isExternal: boolean

  /** Imported symbols, if parseable. */
  readonly importedSymbols?: string[]
}

/**
 * Git metadata at indexing time.
 */
export interface GitMetadata {
  /** Current branch name. */
  readonly branch: string

  /** Current commit hash. */
  readonly commit: string

  /** Remote URL, if configured. */
  readonly remoteUrl?: string

  /** ISO-8601 date of last commit. */
  readonly lastCommitDate: string

  /** List of contributor names/emails. */
  readonly contributors: string[]

  /** Recent commit history. */
  readonly recentCommits: GitCommitInfo[]
}

/**
 * Information about a single git commit.
 */
export interface GitCommitInfo {
  /** Commit hash. */
  readonly hash: string

  /** Commit message. */
  readonly message: string

  /** Author name/email. */
  readonly author: string

  /** ISO-8601 commit date. */
  readonly date: string

  /** Files changed in this commit. */
  readonly filesChanged: string[]
}

// ── Decision memory types ─────────────────────────────────────────────────

/**
 * Records a decision made during plan generation or execution.
 */
export interface DecisionRecord {
  /** Unique memory identifier. */
  readonly id: MemoryId

  /** Associated proposal ID, if any. */
  readonly proposalId?: string

  /** Associated plan ID, if any. */
  readonly planId?: string

  /** Decision outcome type. */
  readonly type: 'accepted' | 'rejected' | 'revised'

  /** Human-readable decision title. */
  readonly title: string

  /** Reasoning behind the decision. */
  readonly reasoning: string

  /** What actually happened (filled in later). */
  readonly outcome?: string

  /** Validation result, if validated. */
  readonly validationResult?: {
    readonly valid: boolean
    readonly errors: string[]
    readonly warnings: string[]
  }

  /** ISO-8601 decision timestamp. */
  readonly timestamp: string
}

// ── Failure memory types ──────────────────────────────────────────────────

/**
 * Records a failure during execution.
 */
export interface FailureRecord {
  /** Unique memory identifier. */
  readonly id: MemoryId

  /** Associated task ID, if any. */
  readonly taskId?: string

  /** Associated step ID, if any. */
  readonly stepId?: string

  /** Failure classification. */
  readonly type: 'execution' | 'validation' | 'recovery' | 'workspace'

  /** Error message or code. */
  readonly error: string

  /** What was happening when it failed. */
  readonly context: string

  /** Whether recovery was attempted. */
  readonly recoveryAttempted: boolean

  /** Outcome of recovery, if attempted. */
  readonly recoveryOutcome?: string

  /** Links to a recurring pattern, if detected. */
  readonly patternId?: string

  /** ISO-8601 failure timestamp. */
  readonly timestamp: string
}

/**
 * A recurring failure pattern detected from multiple failures.
 */
export interface FailurePattern {
  /** Pattern identifier. */
  readonly id: string

  /** Regex or signature that matches this pattern. */
  readonly pattern: string

  /** Pattern classification. */
  readonly type: string

  /** Number of occurrences. */
  readonly occurrences: number

  /** ISO-8601 first seen timestamp. */
  readonly firstSeen: string

  /** ISO-8601 last seen timestamp. */
  readonly lastSeen: string

  /** Memory IDs of failures matching this pattern. */
  readonly memoryIds: MemoryId[]

  /** Suggested action to resolve this pattern. */
  readonly suggestedAction?: string
}

// ── Retrieval trace ───────────────────────────────────────────────────────

/**
 * Audit trail for a memory retrieval operation.
 */
export interface RetrievalTrace {
  /** Unique retrieval trace identifier. */
  readonly id: RetrievalId

  /** The query that was executed. */
  readonly query: MemoryQuery

  /** Results returned. */
  readonly results: MemoryResult[]

  /** The assembled context string. */
  readonly contextUsed: string

  /** Associated reasoning request ID, if any. */
  readonly requestId?: string

  /** ISO-8601 retrieval timestamp. */
  readonly timestamp: string

  /** Retrieval duration in milliseconds. */
  readonly durationMs: number
}

// ── Retrieval context ─────────────────────────────────────────────────────

/**
 * Assembled context for cognition, including memory results and
 * repository intelligence.
 */
export interface RetrievalContext {
  /** Memory query results. */
  readonly results: MemoryResult[]

  /** Deterministic context string assembled from results. */
  readonly contextString: string

  /** Repository context, if available. */
  readonly repositoryContext?: {
    /** The repository map. */
    readonly map: RepositoryMap

    /** Files relevant to the current query. */
    readonly relevantFiles: FileGraphNode[]

    /** Architecture nodes relevant to the current query. */
    readonly architectureNodes: ArchitectureNode[]
  }

  /** Decision context, if available. */
  readonly decisionContext?: {
    /** Recent decisions for context. */
    readonly recentDecisions: DecisionRecord[]

    /** Known failure patterns. */
    readonly failurePatterns: FailurePattern[]
  }

  /** Audit trace for this retrieval. */
  readonly trace: RetrievalTrace
}
