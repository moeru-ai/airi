/**
 * Shared memory scope consumed by stage-ui runtime adapters.
 */
export interface MemoryScope {
  /** Stable user identifier owning the memory slice. */
  userId: string
  /** Character identifier associated with the slice. */
  characterId: string
  /** Optional session identifier for session-local context. */
  sessionId?: string | null
}

/**
 * One stable fact exposed through the shared memory gateway.
 */
export interface MemoryStableFact {
  /** Stable fact identifier. */
  id: string
  /** Stable fact key used for prompt assembly. */
  key: string
  /** Human-readable fact value. */
  value: string
  /** Confidence score normalized to 0..1. */
  confidence: number
}

/**
 * One recent conversational turn exposed through the shared memory gateway.
 */
export interface MemoryRecentTurn {
  /** Stable turn identifier. */
  turnId: string
  /** Speaker role recorded for the turn. */
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Plain-text turn content. */
  text: string
  /** Unix timestamp in milliseconds. */
  createdAt: number
}

/**
 * One memory card exposed through the shared memory gateway.
 */
export interface MemoryCard {
  /** Stable card identifier. */
  id: string
  /** Card title or label. */
  title: string
  /** Card content used for prompt injection or later recall. */
  content: string
  /** Confidence score normalized to 0..1. */
  confidence: number
}

/**
 * Shared prompt-context snapshot returned by the memory gateway.
 */
export interface MemoryPromptContext {
  /** Schema version reported by the active runtime adapter. */
  schemaVersion: number
  /** Scope used to resolve the prompt context. */
  scope: MemoryScope
  /** Current profile summary string, or `null` when none exists. */
  profileSummary: string | null
  /** Current unsuperseded stable facts. */
  stableFacts: MemoryStableFact[]
  /** Latest recent turns ordered for prompt consumption. */
  recentTurns: MemoryRecentTurn[]
  /** Memory cards available for prompt enrichment. */
  memoryCards: MemoryCard[]
}

/**
 * Shared append-turn input consumed by stage-ui runtime adapters.
 */
export interface MemoryAppendTurnInput {
  /** Scope selecting the local memory slice. */
  scope: MemoryScope
  /** Stable turn identifier to append. */
  turnId: string
  /** Speaker role recorded for the turn. */
  role: MemoryRecentTurn['role']
  /** Plain-text turn content. */
  text: string
  /** Optional structured raw payload for replay or sync. */
  rawPayload?: Record<string, unknown> | null
  /** Unix timestamp in milliseconds. */
  createdAt: number
}

/**
 * Shared append-turn result exposed by the memory gateway.
 */
export interface MemoryAppendTurnResult {
  /** Schema version reported by the active runtime adapter. */
  schemaVersion: number
  /** Stable turn identifier accepted by the runtime adapter. */
  storedTurnId: string
  /** Updated sync checkpoint after the append. */
  syncCheckpoint: number
}

/**
 * Shared sync-state snapshot returned by the memory gateway.
 */
export interface MemorySyncState {
  /** Current local sync checkpoint. */
  syncCheckpoint: number
  /** Latest local raw-turn checkpoint. */
  lastLocalTurnCheckpoint: number
  /** Opaque remote checkpoint cursor when one exists. */
  remoteCheckpoint?: string | null
  /** Unix timestamp in milliseconds of the last successful sync. */
  lastSyncedAt?: number | null
  /** Unix timestamp in milliseconds of the last successful raw-turn upload. */
  lastUploadAt?: number | null
  /** Unix timestamp in milliseconds of the last successful patch pull. */
  lastPullAt?: number | null
  /** Current number of pending raw turns. */
  pendingTurnCount?: number
  /** Last successfully applied summary version. */
  lastAppliedSummaryVersion?: number | null
  /** Current sync lifecycle state. */
  state: 'idle' | 'syncing' | 'error'
  /** Optional last sync error summary. */
  lastError?: string | null
}

/**
 * Shared sync-state result exposed by the memory gateway.
 */
export interface MemorySyncStateResult {
  /** Schema version reported by the active runtime adapter. */
  schemaVersion: number
  /** Scope used to resolve the sync-state row. */
  scope: MemoryScope
  /** Runtime mode surfaced by the active memory adapter. */
  runtimeMode?: 'desktop-local-sqlite' | 'web-stub'
  /** Whether background sync is enabled, disabled, or unavailable. */
  syncMode?: 'enabled' | 'disabled' | 'unavailable'
  /** Human-readable sync mode detail. */
  syncModeReason?: string | null
  /** Current sync-state snapshot, or `null` when not initialized. */
  syncState: MemorySyncState | null
}

/**
 * Stable shared memory interface consumed by stage-ui.
 */
export interface MemoryGateway {
  /**
   * Reads the current prompt context for one scope.
   */
  readPromptContext: (input: { scope: MemoryScope }) => Promise<MemoryPromptContext>
  /**
   * Appends one turn into the current runtime memory implementation.
   */
  appendTurn: (input: MemoryAppendTurnInput) => Promise<MemoryAppendTurnResult>
  /**
   * Reads the current sync-state snapshot for one scope.
   */
  getSyncState: (input: { scope: MemoryScope }) => Promise<MemorySyncStateResult>
}

/**
 * Runtime options for creating a stage-ui memory gateway.
 */
export interface CreateMemoryGatewayOptions {
  /** Which runtime adapter to build. */
  runtime: 'desktop' | 'web'
  /** Optional Electron renderer IPC transport override for desktop tests or custom hosts. */
  ipcRenderer?: unknown
}
