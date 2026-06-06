import type { AlayaOptions, MemoryEntry } from './types'

/**
 * Shared configuration constants for the Alaya memory system.
 *
 * Centralized here so the summarizer, retriever, and Alaya driver all
 * read from a single source of truth.
 */

/** Default weight for importance in composite retrieval score. */
export const DEFAULT_IMPORTANCE_WEIGHT = 0.6

/** Default weight for recency in composite retrieval score. */
export const DEFAULT_RECENCY_WEIGHT = 0.4

/** Half-life for exponential recency decay (7 days). */
export const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Heuristic-based importance estimation for a memory entry.
 *
 * This is a v1 lightweight scorer. Future versions may incorporate
 * LLM-based importance ranking or embedding-based similarity scoring.
 *
 * Rules applied (each contributes to the final score):
 * - Content length: very short (1 line) or very long (>=5 lines)
 * - Source: manual entries get highest base score; system lower
 * - Tags: tagged memories are more likely to be intentional
 * - Type: preferences (+0.15) > facts (+0.10) > events (-0.05)
 * - Access count: frequently recalled entries are more important
 *
 * Returns a score in [0, 1].
 */
export function scoreImportance(entry: MemoryEntry): number {
  const content = entry.content || entry.summary || ''
  let score = 0.5

  // ---- content-length heuristic ----
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 1) {
    score += 0.1 // concise fact
  }
  else if (lines.length >= 5) {
    score += 0.05 // detailed memory
  }

  // ---- source heuristic ----
  switch (entry.source) {
    case 'manual':
      score += 0.2
      break
    case 'system':
      score -= 0.05
      break
  }

  // ---- tags heuristic ----
  if (entry.tags.length > 0) {
    score += 0.1
  }

  // ---- type heuristic ----
  // Preferences and facts are inherently more important than raw events
  // or session digests. This helps the retriever surface high-signal
  // entries and guides the auto-digester's threshold decisions.
  if (entry.type) {
    switch (entry.type) {
      case 'preference':
        score += 0.15
        break
      case 'fact':
        score += 0.10
        break
      case 'event':
        score -= 0.05
        break
      // session_digest — neutral (already summarized from raw events)
    }
  }

  // ---- access-count heuristic ----
  if (entry.accessCount > 5) {
    score += 0.1
  }

  return clamp(score)
}

/**
 * Recency score based on elapsed time since last access.
 *
 * Uses an exponential-decay curve so that very recent accesses score
 * near 1.0 and very old accesses asymptote towards 0.
 */
export function scoreRecency(
  entry: MemoryEntry,
  now: number = Date.now(),
  halfLifeMs: number = RECENCY_HALF_LIFE_MS,
): number {
  const elapsed = now - entry.lastAccessedAt

  if (elapsed <= 0) {
    return 1.0
  }

  // Exponential decay: score = 2^(-elapsed / halfLife)
  const decay = 2 ** (-elapsed / halfLifeMs)
  return clamp(decay)
}

/**
 * Composite retrieval score combining importance and real-time recency.
 *
 * IMPORTANT: Unlike reading `entry.recency` (which is a snapshot from
 * the last write), this function calls `scoreRecency()` to compute the
 * live decayed value at call time.
 */
export function compositeScore(
  entry: MemoryEntry,
  relevance = 1.0,
  options: Pick<AlayaOptions, 'importanceWeight' | 'recencyWeight'> = {},
): number {
  const wImportance = options.importanceWeight ?? DEFAULT_IMPORTANCE_WEIGHT
  const wRecency = options.recencyWeight ?? DEFAULT_RECENCY_WEIGHT

  // Use live recency, not the snapshot field
  const r = scoreRecency(entry)

  return clamp((wImportance * entry.importance + wRecency * r) * relevance)
}

function clamp(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}
