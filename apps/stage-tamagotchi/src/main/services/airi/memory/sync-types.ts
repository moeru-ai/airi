import type { MemoryRawTurnRecord, MemoryRepositoryScope, MemorySyncStateRecord } from './types'

/**
 * One local trigger decision for uploading pending raw turns.
 */
export interface MemoryRawTurnSyncTrigger {
  /** Why the pending batch is eligible for upload. */
  type: 'turn-count-threshold' | 'character-threshold' | 'oldest-turn-age-threshold' | 'idle-threshold'
  /** Pending turn count observed at decision time. */
  pendingTurnCount: number
  /** Total pending text length observed at decision time. */
  pendingCharacterCount: number
  /** Age in milliseconds of the oldest pending turn. */
  oldestPendingTurnAgeMs: number
  /** Idle duration in milliseconds since the most recent pending turn. */
  idleDurationMs: number
}

/**
 * Configurable local thresholds for raw-turn upload decisions.
 */
export interface MemoryRawTurnSyncConfig {
  /** Upload after this many pending turns. @default 4 */
  turnCountThreshold: number
  /** Upload after this many pending text characters. @default 2000 */
  charThreshold: number
  /** Upload once the oldest pending turn reaches this age in ms. @default 90000 */
  oldestPendingAgeMs: number
  /** Upload once no new pending turn has arrived for this long in ms. @default 8000 */
  idleAfterMs: number
  /** Background polling cadence in ms when the agent is started. @default 1000 */
  pollIntervalMs: number
  /** Local retry backoff in ms after a failed upload. @default 30000 */
  retryDelayMs: number
}

/**
 * Upload request passed to the abstract raw-turn upload client.
 */
export interface MemoryRawTurnUploadRequest {
  /** Scope that owns the incremental turn batch. */
  scope: MemoryRepositoryScope
  /** Incremental pending turns selected for upload. */
  turns: MemoryRawTurnRecord[]
  /** Local trigger that caused the upload to run. */
  trigger: MemoryRawTurnSyncTrigger
}

/**
 * Abstract upload client for raw-turn sync.
 */
export interface MemoryRawTurnUploadClient {
  /**
   * Uploads one incremental batch of raw turns.
   */
  uploadRawTurns: (request: MemoryRawTurnUploadRequest) => Promise<void>
}

/**
 * Runtime config for the raw-turn upload adapter.
 */
export interface MemoryRawTurnUploaderConfig {
  /** Whether remote raw-turn upload is enabled. */
  enabled: boolean
  /** Remote upload endpoint URL. */
  endpointUrl?: string | null
  /** Bearer token or API key used by the uploader. */
  authToken?: string | null
  /** Request timeout in milliseconds for one upload attempt. */
  requestTimeoutMs: number
}

/**
 * Visible uploader runtime status for diagnostics and tests.
 */
export interface MemoryRawTurnUploaderStatus {
  /** Whether the uploader is active or a disabled no-op. */
  mode: 'active' | 'disabled'
  /** Human-readable reason when disabled. */
  reason?: string
  /** Resolved endpoint URL when active. */
  endpointUrl?: string | null
}

/**
 * One remote profile-summary patch.
 */
export interface MemoryProfileSummaryPatch {
  /** Monotonic remote summary version. */
  summaryVersion: number
  /** Renderable markdown summary content. */
  summaryMarkdown: string
  /** Source turn that generated the summary. */
  generatedFromTurnId: string
  /** Confidence score normalized to 0..1. */
  confidence?: number
}

/**
 * One remote stable-fact patch item.
 */
export interface MemoryStableFactPatch {
  /** Stable fact key used for supersede merge. */
  factKey: string
  /** Stable fact value. */
  factValue: string
  /** Source turn that generated the fact. */
  generatedFromTurnId: string
  /** Confidence score normalized to 0..1. */
  confidence?: number
}

/**
 * One remote memory-card patch item.
 */
export interface MemoryCardPatch {
  /** Stable memory-card identifier. */
  id: string
  /** Card title or label. */
  title: string
  /** Card content body. */
  content: string
  /** Source turn that generated the card, when available. */
  generatedFromTurnId?: string | null
  /** Confidence score normalized to 0..1. */
  confidence?: number
}

/**
 * One incremental memory patch payload fetched from the cloud.
 */
export interface MemoryPatchPayload {
  /** Scope the patch applies to. */
  scope: MemoryRepositoryScope
  /** Optional summary patch for the scope. */
  summaryPatch?: MemoryProfileSummaryPatch | null
  /** Optional stable-fact patch batch. */
  factsPatch?: MemoryStableFactPatch[]
  /** Optional memory-card upsert batch. */
  memoryCards?: MemoryCardPatch[]
}

/**
 * Result of applying one fetched memory patch locally.
 */
export interface ApplyMemoryPatchResult {
  /** Whether the summary patch was applied. */
  appliedSummary: boolean
  /** Number of fact rows applied. */
  appliedFactsCount: number
  /** Number of memory-card rows upserted. */
  appliedMemoryCardCount: number
  /** Explicit summary rejection reason, if one occurred. */
  rejectedSummaryReason: null | 'outdated-summary-version' | 'outdated-generated-from-turn'
}

/**
 * Abstract pull client for incremental memory patches.
 */
export interface MemoryPatchPullClient {
  /**
   * Fetches one incremental memory patch for a scope and current local state.
   */
  fetchMemoryPatch: (scope: MemoryRepositoryScope, state: MemorySyncStateRecord | null) => Promise<MemoryPatchPayload | null>
}

/**
 * Runtime config for the memory patch pull adapter.
 */
export interface MemoryPatchPullConfig {
  /** Whether remote patch pulling is enabled. */
  enabled: boolean
  /** Remote patch endpoint URL. */
  endpointUrl?: string | null
  /** Bearer token or API key used by the patch puller. */
  authToken?: string | null
  /** Request timeout in milliseconds for one patch fetch. */
  requestTimeoutMs: number
  /** Periodic pull interval in milliseconds. */
  pullIntervalMs: number
  /** Local retry backoff in milliseconds after a failed pull. */
  retryDelayMs: number
}

/**
 * Visible patch-pull runtime status for diagnostics and tests.
 */
export interface MemoryPatchPullStatus {
  /** Whether the patch puller is active or a disabled no-op. */
  mode: 'active' | 'disabled'
  /** Human-readable reason when disabled. */
  reason?: string
  /** Resolved endpoint URL when active. */
  endpointUrl?: string | null
}

/**
 * Combined memory sync runtime config.
 */
export interface MemoryRawTurnSyncRuntimeConfig extends MemoryRawTurnSyncConfig {
  /** Local raw/recent turn retention window in ms after successful upload confirmation. */
  rawTurnRetentionWindowMs: number
  uploader: MemoryRawTurnUploaderConfig
  patch: MemoryPatchPullConfig
}
