/**
 * Alaya Memory Layer — types.
 *
 * Alaya is the long-term memory driver for AIRI. It ingests, stores,
 * retrieves, and summarises character-specific memories inside the browser
 * using unstorage (IndexedDB) as the persistence backend.
 *
 * Architecture position:
 *   DB → DBDriver → MemoryDriver (Alaya) → Memory → Core
 */

/** Unique identifier for a memory entry. Generated client-side (nanoid). */
export type MemoryId = string

/**
 * How an individual memory entry was created.
 *
 * - `chat`     — extracted from a conversation by the AI
 * - `manual`   — directly written by the user
 * - `system`   — injected by a system hook or bridge
 */
export type MemorySource = 'chat' | 'manual' | 'system'

/** A single stored memory record. */
export interface MemoryEntry {
  /** Stable client-side id. */
  id: MemoryId

  /** Who owns this memory. */
  characterId: string

  /** The raw memory text (natural language). */
  content: string

  /**
   * Importance score in [0, 1].
   *
   * Higher scores indicate memories that should be retained longer and
   * surfaced earlier in retrieval results. Calculated by the scorer.
   */
  importance: number

  /**
   * Recency score in [0, 1]. Updated on each access.
   *
   * Newer-access entries rank higher in retrieval.
   */
  recency: number

  /**
   * Semantic type of this memory entry, used for classification and
   * routing between short-term and long-term memory pools.
   *
   * - `fact`          — declarative fact about the user or world
   * - `preference`    — user preference / taste / habit
   * - `event`         — an episodic event or interaction log
   * - `session_digest` — summary auto-generated from a completed session
   */
  type?: 'fact' | 'preference' | 'event' | 'session_digest'

  /** Where this memory originated. */
  source: MemorySource

  /** Optional user-defined or auto-detected tags for categorisation. */
  tags: string[]

  /**
   * Compressed summary for older memories.
   *
   * When a memory ages past a configurable threshold, the summarizer
   * replaces `content` with a condensed version here and clears
   * `content` to save storage.
   */
  summary?: string

  /** Unix-ms timestamp of creation. */
  createdAt: number

  /** Unix-ms timestamp of last update. */
  updatedAt: number

  /** Unix-ms timestamp of last retrieval. */
  lastAccessedAt: number

  /** Total number of times this memory has been retrieved. */
  accessCount: number
}

/** Input when creating or updating a memory. */
export interface MemoryInput {
  characterId: string
  content: string
  source?: MemorySource
  tags?: string[]
  type?: MemoryEntry['type']
}

/**
 * A query filter used when retrieving memories.
 *
 * `text` triggers keyword-based search; when absent, results are sorted
 * by the composite score only.
 */
export interface MemoryQuery {
  /** Optional free-text keyword search term. */
  text?: string

  /** Restrict to a specific character. */
  characterId: string

  /** Optional tag filter (OR semantics). */
  tags?: string[]

  /** Max results to return (default 10). */
  limit?: number

  /** Minimum importance threshold [0, 1]. Default 0. */
  minImportance?: number
}

/** Returned by retrieval operations. */
export interface MemorySearchResult {
  entry: MemoryEntry

  /**
   * Composite score combining importance, recency, and (when applicable)
   * keyword-relevance. Higher is better.
   */
  score: number
}

/**
 * Configurable options for the Alaya memory driver.
 */
export interface AlayaOptions {
  /**
   * Maximum number of uncompressed memories kept per character.
   *
   * When exceeded, the summarizer compresses the oldest entries.
   * @default 200
   */
  maxUncompressed?: number

  /**
   * Age threshold (ms) after which a memory is eligible for summarization.
   * @default 7 days (604_800_000 ms)
   */
  summariseAfterMs?: number

  /**
   * Weight applied to importance in the composite retrieval score.
   * @default 0.6
   */
  importanceWeight?: number

  /**
   * Weight applied to recency in the composite retrieval score.
   * @default 0.4
   */
  recencyWeight?: number

  /**
   * Per-character memory limit. Oldest/lowest-scored memories are evicted
   * when exceeded.
   * @default 1000
   */
  maxEntriesPerCharacter?: number

  /**
   * Current user id, used to scope the IndexedDB storage namespace.
   * Falls back to 'default' when not provided.
   */
  userId?: string
}

/**
 * Snapshot of the Alaya store, used by devtools / observers.
 */
export interface AlayaSnapshot {
  characterId: string
  totalEntries: number
  newestEntryAt: number | null
  oldestEntryAt: number | null
}
