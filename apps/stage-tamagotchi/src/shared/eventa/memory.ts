import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Shared scope identity for local-first desktop memory records.
 */
export interface ElectronMemoryScope {
  /** Stable user identifier owning the memory slice. */
  userId: string
  /** Character identifier associated with the slice. */
  characterId: string
  /** Session identifier for session-local memory views. */
  sessionId?: string | null
}

/**
 * One recent conversational turn used to assemble prompt context.
 */
export interface ElectronMemoryRecentTurnSnapshot {
  /** Stable turn identifier. */
  turnId: string
  /** Speaker role recorded for the turn. */
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Plain-text form used for prompt assembly. */
  text: string
  /** Unix timestamp in milliseconds. */
  createdAt: number
}

/**
 * One stable fact recalled into the prompt context.
 */
export interface ElectronMemoryStableFactSnapshot {
  /** Stable fact identifier. */
  id: string
  /** Fact key or short label. */
  key: string
  /** Human-readable fact value. */
  value: string
  /** Confidence score normalized to 0..1. */
  confidence: number
}

/**
 * One higher-level memory card assembled for later retrieval.
 */
export interface ElectronMemoryCardSnapshot {
  /** Stable card identifier. */
  id: string
  /** Card title or label. */
  title: string
  /** Card body that can be injected into prompts. */
  content: string
  /** Confidence score normalized to 0..1. */
  confidence: number
}

/**
 * One sync status snapshot for the scoped local memory slice.
 */
export interface ElectronMemorySyncStateSnapshot {
  /** Monotonic local checkpoint that marks the latest synced boundary. */
  syncCheckpoint: number
  /** Latest raw turn checkpoint seen locally. */
  lastLocalTurnCheckpoint: number
  /** Opaque remote cursor or checkpoint identifier if available. */
  remoteCheckpoint?: string | null
  /** Unix timestamp in milliseconds of the last successful sync attempt. */
  lastSyncedAt?: number | null
  /** Unix timestamp in milliseconds of the last successful raw-turn upload. */
  lastUploadAt?: number | null
  /** Unix timestamp in milliseconds of the last successful patch pull. */
  lastPullAt?: number | null
  /** Current number of pending raw turns for the scope. */
  pendingTurnCount?: number
  /** Last successfully applied summary version. */
  lastAppliedSummaryVersion?: number | null
  /** Human-readable state for future sync orchestration. */
  state: 'idle' | 'syncing' | 'error'
  /** Optional last sync error summary. */
  lastError?: string | null
}

/**
 * Request payload for assembling prompt context from desktop local memory.
 */
export interface ElectronMemoryReadPromptContextRequest {
  /** Scope selecting the local-first memory slice. */
  scope: ElectronMemoryScope
  /** Maximum recent conversational turns to include. */
  recentTurnLimit?: number
  /** Maximum stable facts to include. */
  stableFactLimit?: number
  /** Maximum memory cards to include. */
  memoryCardLimit?: number
}

/**
 * Response payload for prompt-context reads.
 */
export interface ElectronMemoryReadPromptContextResponse {
  /** Current schema version used by the local memory layer. */
  schemaVersion: number
  /** Scope used to resolve the prompt context. */
  scope: ElectronMemoryScope
  /** Optional profile summary for the scope. */
  profileSummary?: string | null
  /** Stable facts selected for prompt assembly. */
  stableFacts: ElectronMemoryStableFactSnapshot[]
  /** Recent turns selected for prompt assembly. */
  recentTurns: ElectronMemoryRecentTurnSnapshot[]
  /** Memory cards selected for prompt assembly. */
  memoryCards: ElectronMemoryCardSnapshot[]
}

/**
 * Request payload for appending one turn into the local memory log.
 */
export interface ElectronMemoryAppendTurnRequest {
  /** Scope selecting the local-first memory slice. */
  scope: ElectronMemoryScope
  /** Stable turn identifier to append. */
  turnId: string
  /** Speaker role recorded for the turn. */
  role: ElectronMemoryRecentTurnSnapshot['role']
  /** Plain-text turn content. */
  text: string
  /** Optional structured raw payload for future replay or sync. */
  rawPayload?: Record<string, unknown> | null
  /** Unix timestamp in milliseconds. */
  createdAt: number
}

/**
 * Response payload for local turn append requests.
 */
export interface ElectronMemoryAppendTurnResponse {
  /** Current schema version used by the local memory layer. */
  schemaVersion: number
  /** Turn identifier accepted by the local memory layer. */
  storedTurnId: string
  /** Updated sync checkpoint after the append. */
  syncCheckpoint: number
}

/**
 * Request payload for reading sync state without mutating local memory.
 */
export interface ElectronMemoryGetSyncStateRequest {
  /** Scope selecting the local-first memory slice. */
  scope: ElectronMemoryScope
}

/**
 * Response payload for sync-state reads.
 */
export interface ElectronMemoryGetSyncStateResponse {
  /** Current schema version used by the local memory layer. */
  schemaVersion: number
  /** Scope used to resolve the sync state. */
  scope: ElectronMemoryScope
  /** Runtime mode surfaced to renderer consumers. */
  runtimeMode?: 'desktop-local-sqlite' | 'web-stub'
  /** Whether background sync is enabled, disabled, or unavailable. */
  syncMode?: 'enabled' | 'disabled' | 'unavailable'
  /** Human-readable sync mode detail. */
  syncModeReason?: string | null
  /** Current sync state snapshot, if the scope has been initialized. */
  syncState?: ElectronMemorySyncStateSnapshot | null
}

export const electronMemoryReadPromptContext = defineInvokeEventa<
  ElectronMemoryReadPromptContextResponse,
  ElectronMemoryReadPromptContextRequest
>('eventa:invoke:electron:memory:read-prompt-context')

export const electronMemoryAppendTurn = defineInvokeEventa<
  ElectronMemoryAppendTurnResponse,
  ElectronMemoryAppendTurnRequest
>('eventa:invoke:electron:memory:append-turn')

export const electronMemoryGetSyncState = defineInvokeEventa<
  ElectronMemoryGetSyncStateResponse,
  ElectronMemoryGetSyncStateRequest
>('eventa:invoke:electron:memory:get-sync-state')
