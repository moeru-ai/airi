import type { MemoryInput } from './types'

/**
 * Alaya Short-Term Memory — session-scoped, in-memory turn buffer.
 *
 * ## Architecture position
 * ```
 * Chat Pipeline → ShortTermMemory (in-memory) → auto-digest → AlayaMemory (persistent)
 * ```
 *
 * ## Design principles
 * - **In-memory only** — no IndexedDB persistence. Short-term memory is
 *   session-scoped and discarded on page reload by default.
 * - **Timing window** — `getRecentTurns(N)` returns the last N turns in
 *   chronological order for LLM context injection.
 * - **Auto-digest** — `compact()` scores each turn, and entries exceeding
 *   the threshold are returned as `MemoryInput` candidates for the caller
 *   to pass to `AlayaMemory.ingest()`.
 */

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface ShortTermTurn {
  /** Stable id — nanoid, generated on add. */
  id: string

  /** Owning character. */
  characterId: string

  /** Session identifier (stable across turns). */
  sessionId: string

  /** Who spoke. */
  role: 'user' | 'assistant'

  /** The full message content. */
  content: string

  /** Monotonic turn index within the session. */
  turnIndex: number

  /** Unix-ms timestamp of when this turn was recorded. */
  timestamp: number
}

export interface ShortTermMemoryOptions {
  /** Max turns to keep in the buffer. Default 20. */
  maxTurns?: number

  /**
   * Importance threshold [0, 1] for auto-digesting a turn into
   * long-term memory. Turns scoring above this are returned as
   * digest candidates in `compact()`. Default 0.6.
   */
  digestThreshold?: number
}

/** Returned by `compact()`. */
export interface CompactResult {
  /** Entries that meet the digest threshold — ready to `alaya.ingest()`. */
  digestCandidates: MemoryInput[]

  /** Number of turns evicted from the buffer during compaction. */
  evictedCount: number

  /** Remaining turn count after compaction. */
  remainingCount: number
}

// ------------------------------------------------------------------
// ShortTermMemory
// ------------------------------------------------------------------

export class ShortTermMemory {
  #turns: ShortTermTurn[] = []
  #maxTurns: number
  #digestThreshold: number

  constructor(options: ShortTermMemoryOptions = {}) {
    this.#maxTurns = options.maxTurns ?? 20
    this.#digestThreshold = options.digestThreshold ?? 0.6
  }

  // ----------------------------------------------------------------
  // Turn management
  // ----------------------------------------------------------------

  /**
   * Record a new turn in the buffer.
   *
   * Auto-evicts the oldest turn when the buffer exceeds `maxTurns`.
   * The evicted turn is NOT auto-digested — call `compact()` explicitly
   * when you want to drain and digest the buffer.
   */
  addTurn(turn: Omit<ShortTermTurn, 'id' | 'timestamp' | 'turnIndex'>): ShortTermTurn {
    const entry: ShortTermTurn = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      turnIndex: this.#turns.length,
      ...turn,
    }

    this.#turns.push(entry)

    // Enforce max buffer size — silently evict oldest if over
    if (this.#turns.length > this.#maxTurns) {
      this.#turns.shift()
    }

    return entry
  }

  /**
   * Returns the most recent N turns (default: all), newest first.
   */
  getRecentTurns(n?: number): ShortTermTurn[] {
    const slice = n != null ? this.#turns.slice(-n) : this.#turns
    return [...slice].reverse() // newest first for LLM context injection
  }

  /** Total turns currently in the buffer. */
  get count(): number {
    return this.#turns.length
  }

  /** Whether the buffer is empty. */
  get isEmpty(): boolean {
    return this.#turns.length === 0
  }

  // ----------------------------------------------------------------
  // Compaction & auto-digest
  // ----------------------------------------------------------------

  /**
   * Compact the turn buffer: score all turns, return candidates that
   * meet the digest threshold, and clear the buffer.
   *
   * Call this at session end or when the buffer approaches `maxTurns`.
   *
   * The caller should take the returned `digestCandidates` and pass
   * them to `AlayaMemory.ingest()` / `ingestAll()`.
   */
  compact(): CompactResult {
    const digestCandidates: MemoryInput[] = []
    let evictedCount = 0

    for (const turn of this.#turns) {
      const importance = scoreShortTermTurn(turn)

      if (importance >= this.#digestThreshold) {
        digestCandidates.push({
          characterId: turn.characterId,
          content: turn.content,
          source: 'chat',
          type: 'event',
          tags: [`session:${turn.sessionId}`, `role:${turn.role}`],
        })
      }
      else {
        evictedCount++
      }
    }

    const remainingCount = this.#turns.length
    this.#turns = []

    return { digestCandidates, evictedCount, remainingCount }
  }

  /**
   * Drain and compact the buffer without clearing it.
   *
   * Useful for periodic auto-digest during long-running sessions
   * where you want to preserve recent turns while flushing older ones.
   *
   * Keeps the last `keepRecent` turns in the buffer.
   */
  compactPartial(keepRecent: number): CompactResult {
    if (this.#turns.length <= keepRecent) {
      return { digestCandidates: [], evictedCount: 0, remainingCount: this.#turns.length }
    }

    const toDigest = this.#turns.slice(0, this.#turns.length - keepRecent)
    const keep = this.#turns.slice(-keepRecent)

    const digestCandidates: MemoryInput[] = []
    let evictedCount = 0

    for (const turn of toDigest) {
      const importance = scoreShortTermTurn(turn)

      if (importance >= this.#digestThreshold) {
        digestCandidates.push({
          characterId: turn.characterId,
          content: turn.content,
          source: 'chat',
          type: 'event',
          tags: [`session:${turn.sessionId}`, `role:${turn.role}`],
        })
      }
      else {
        evictedCount++
      }
    }

    this.#turns = keep

    return { digestCandidates, evictedCount, remainingCount: keep.length }
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------

  /** Clear all turns without digesting. */
  clear(): void {
    this.#turns = []
  }

  /** Build a compact context string for LLM injection. */
  buildContext(maxTurns = 10): string | null {
    const recent = this.getRecentTurns(maxTurns)
    if (recent.length === 0)
      return null

    const lines = recent.map(t =>
      `[${t.role === 'user' ? 'User' : 'Assistant'}] ${t.content.slice(0, 300)}`,
    )

    return `<recent_conversation>\n${lines.join('\n')}\n</recent_conversation>`
  }
}

// ------------------------------------------------------------------
// Scoring helper
// ------------------------------------------------------------------

/**
 * Lightweight heuristic scorer for short-term turns.
 *
 * Returns a score in [0, 1].
 *
 * Factors:
 * - Length: substantial content (≥30 chars) scores higher
 * - User turns: preferences/facts from the user are more important
 * - Presence of named entities / proper nouns (loose heuristic)
 */
function scoreShortTermTurn(turn: ShortTermTurn): number {
  const content = turn.content.trim()
  if (!content)
    return 0

  let score = 0.3

  // Length heuristic
  if (content.length >= 150) {
    score += 0.15 // substantial message
  }
  else if (content.length >= 30) {
    score += 0.10
  }

  // User messages tend to contain more preference signals
  if (turn.role === 'user') {
    score += 0.10
  }

  // Simple named-entity heuristic: capitalised words suggest facts
  const capitalizedWords = content.match(/\b[A-Z][a-z]{2,}\b/g)
  if (capitalizedWords && capitalizedWords.length >= 2) {
    score += 0.10
  }

  // Score question markers (preference queries)
  if (/\b(like|prefer|favorite|hate|love|enjoy|hobby|名字|喜欢|爱好|讨厌|觉得)\b/i.test(content)) {
    score += 0.10
  }

  return Math.min(1, Math.max(0, score))
}
