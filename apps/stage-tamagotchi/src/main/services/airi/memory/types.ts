/**
 * Local-first memory scope resolved inside the desktop SQLite repository.
 */
export interface MemoryRepositoryScope {
  /** Stable user identifier owning the memory slice. */
  userId: string
  /** Character identifier associated with the slice. */
  characterId: string
  /** Optional session identifier for session-local records. */
  sessionId?: string | null
}

/**
 * Current profile summary row returned by the repository.
 */
export interface MemoryProfileSummaryRecord {
  /** Stable summary identifier. */
  id: string
  /** Scope that owns the summary. */
  scope: MemoryRepositoryScope
  /** Monotonic summary version within the user/character pair. */
  version: number
  /** Renderable markdown summary content. */
  summaryMarkdown: string
  /** Source turn that generated the summary, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. */
  confidence: number
  /** Newer row that superseded this one, if any. */
  supersededBy?: string | null
  /** Unix timestamp in milliseconds when the row was created. */
  createdAt: number
  /** Unix timestamp in milliseconds when the row was last updated. */
  updatedAt: number
}

/**
 * Current stable fact row returned by the repository.
 */
export interface MemoryStableFactRecord {
  /** Stable fact identifier. */
  id: string
  /** Scope that owns the fact. */
  scope: MemoryRepositoryScope
  /** Monotonic fact version within the scoped fact key. */
  version: number
  /** Stable fact key used for upserts and recall. */
  factKey: string
  /** Stable fact value surfaced to prompt assembly. */
  factValue: string
  /** Source turn that generated the fact, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. */
  confidence: number
  /** Newer row that superseded this one, if any. */
  supersededBy?: string | null
  /** Unix timestamp in milliseconds when the row was created. */
  createdAt: number
  /** Unix timestamp in milliseconds when the row was last updated. */
  updatedAt: number
}

/**
 * Recent conversational turn returned by the repository.
 */
export interface MemoryRecentTurnRecord {
  /** Stable turn identifier. */
  turnId: string
  /** Scope that owns the turn. */
  scope: MemoryRepositoryScope
  /** Row version for future mutable turn workflows. */
  version: number
  /** Speaker role recorded for the turn. */
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Plain-text content used for prompt assembly. */
  text: string
  /** Unix timestamp in milliseconds when the turn was created. */
  createdAt: number
  /** Unix timestamp in milliseconds when the row was last updated. */
  updatedAt: number
}

/**
 * Raw turn row returned by the repository for sync/upload workflows.
 */
export interface MemoryRawTurnRecord {
  /** Stable turn identifier. */
  turnId: string
  /** Scope that owns the turn. */
  scope: MemoryRepositoryScope
  /** Row version for sync bookkeeping. */
  version: number
  /** Speaker role recorded for the turn. */
  role: MemoryRecentTurnRecord['role']
  /** Plain-text content paired from `recent_turns` for thresholds and uploads. */
  text: string
  /** Structured raw payload parsed from the raw-turn log. */
  rawPayload?: Record<string, unknown> | null
  /** Current raw-turn sync status. */
  syncStatus: 'pending' | 'uploaded'
  /** Unix timestamp in milliseconds when the row was created. */
  createdAt: number
  /** Unix timestamp in milliseconds when the row was last updated. */
  updatedAt: number
}

/**
 * Sync-state row returned by the repository.
 */
export interface MemorySyncStateRecord {
  /** Stable sync-state identifier. */
  id: string
  /** Scope that owns the sync-state row. */
  scope: MemoryRepositoryScope
  /** Row version for future migration-safe updates. */
  version: number
  /** Source turn that produced the current checkpoint, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. */
  confidence: number
  /** Newer row that superseded this one, if any. */
  supersededBy?: string | null
  /** Current local sync checkpoint. */
  syncCheckpoint: number
  /** Latest local raw-turn checkpoint. */
  lastLocalTurnCheckpoint: number
  /** Remote checkpoint cursor when the scope has synced before. */
  remoteCheckpoint?: string | null
  /** Last synced turn identifier, when available. */
  lastSyncedTurnId?: string | null
  /** Unix timestamp in milliseconds of the last successful sync. */
  lastSyncedAt?: number | null
  /** Last successfully uploaded raw-turn identifier, when available. */
  lastUploadedTurnId?: string | null
  /** Unix timestamp in milliseconds of the last successful raw-turn upload. */
  lastUploadAt?: number | null
  /** Last successfully applied summary version from remote patches. */
  lastAppliedSummaryVersion: number
  /** Generated-from turn id of the latest applied remote patch checkpoint. */
  lastAppliedGeneratedFromTurnId?: string | null
  /** Numeric checkpoint of the latest applied remote patch turn. */
  lastAppliedTurnCheckpoint: number
  /** Unix timestamp in milliseconds of the last successful patch pull. */
  lastPullAt?: number | null
  /** Next scheduled pull timestamp in milliseconds. */
  nextPullAt?: number | null
  /** Current number of pending raw turns for the scope. */
  pendingTurnCount: number
  /** Current upload retry count for the scope. */
  retryCount: number
  /** Next retry timestamp in milliseconds, when backoff is active. */
  nextRetryAt?: number | null
  /** Current sync lifecycle state. */
  state: string
  /** Last sync error summary, when available. */
  lastError?: string | null
  /** Unix timestamp in milliseconds when the row was created. */
  createdAt: number
  /** Unix timestamp in milliseconds when the row was last updated. */
  updatedAt: number
}

/**
 * Input for appending one raw and recent turn in the same transaction.
 */
export interface MemoryAppendTurnInput {
  /** Scope that owns the turn. */
  scope: MemoryRepositoryScope
  /** Stable turn identifier. */
  turnId: string
  /** Speaker role recorded for the turn. */
  role: MemoryRecentTurnRecord['role']
  /** Plain-text form used for prompt assembly. */
  text: string
  /** Structured raw payload persisted into the raw-turn log. */
  rawPayload?: Record<string, unknown> | null
  /** Unix timestamp in milliseconds for both created_at and updated_at. */
  createdAt: number
}

/**
 * Input for replacing the current user/character profile summary.
 */
export interface MemoryReplaceProfileSummaryInput {
  /** Scope that owns the summary. Session is stored but not part of current-summary uniqueness. */
  scope: MemoryRepositoryScope
  /** Renderable markdown summary content. */
  summaryMarkdown: string
  /** Source turn that generated the summary, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. @default 1 */
  confidence?: number
  /** Unix timestamp in milliseconds for both created_at and updated_at. */
  updatedAt: number
}

/**
 * Input for upserting one stable fact inside a scope.
 */
export interface MemoryUpsertStableFactInput {
  /** Scope that owns the fact. */
  scope: MemoryRepositoryScope
  /** Stable fact key used to locate the current fact row. */
  factKey: string
  /** Stable fact value to persist as the new current row. */
  factValue: string
  /** Source turn that generated the fact, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. @default 1 */
  confidence?: number
  /** Unix timestamp in milliseconds for both created_at and updated_at. */
  updatedAt: number
}

/**
 * Input for reading the current prompt context from local SQLite memory.
 */
export interface MemoryReadPromptContextInput {
  /** Scope used to resolve stable facts and recent turns. */
  scope: MemoryRepositoryScope
}

/**
 * Repository result for prompt-context assembly.
 */
export interface MemoryPromptContext {
  /** Current profile summary for the user/character pair, if one exists. */
  profileSummary: MemoryProfileSummaryRecord | null
  /** Current unsuperseded stable facts for the scope. */
  stableFacts: MemoryStableFactRecord[]
  /** Latest 24 turns for the scope, ordered by time ascending. */
  recentTurns: MemoryRecentTurnRecord[]
}

/**
 * Input for reading sync-state rows from local SQLite memory.
 */
export interface MemoryGetSyncStateInput {
  /** Scope used to resolve the sync-state row. */
  scope: MemoryRepositoryScope
}
