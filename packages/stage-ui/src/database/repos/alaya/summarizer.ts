import type { AlayaOptions, MemoryEntry } from './types'

import {
  compositeScore,
  DEFAULT_IMPORTANCE_WEIGHT,
  DEFAULT_RECENCY_WEIGHT,
} from './scorer'

/**
 * Memory summarization utilities.
 *
 * V1 summarization uses rule-based truncation (keep the first N chars
 * of the content as the summary). V2 will introduce LLM-based
 * summarization via the consciousness module.
 */

const DEFAULT_MAX_UNCOMPRESSED = 200
const DEFAULT_SUMMARISE_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const DEFAULT_MAX_ENTRIES = 1000

/**
 * Produces a lightweight summary of a memory entry.
 *
 * V1: keeps the first significant sentence; V2 will use LLM.
 */
export function generateSummary(entry: MemoryEntry): string {
  const text = entry.content
  if (!text || text.length <= 120) {
    return text || ''
  }

  // Try to break at a sentence boundary within the first 140 chars
  const snippet = text.slice(0, 140)
  const lastPeriod = snippet.lastIndexOf('.')
  const lastExcl = snippet.lastIndexOf('!')
  const lastQ = snippet.lastIndexOf('?')
  const lastBreak = Math.max(lastPeriod, lastExcl, lastQ)

  if (lastBreak > 40) {
    return text.slice(0, lastBreak + 1)
  }

  // Fallback: truncate at word boundary
  const lastSpace = snippet.lastIndexOf(' ')
  return lastSpace > 40
    ? `${text.slice(0, lastSpace)}\u2026`
    : `${text.slice(0, 120)}\u2026`
}

/**
 * Compresses old memories by moving their content into a summary.
 *
 * Pipeline (applied in order):
 * 1. Age-threshold: entries older than `summariseAfterMs` → summarise
 * 2. Count-threshold: if uncompressed entries > `maxUncompressed` →
 *    summarise lowest-scored until under limit
 * 3. Hard eviction: if total > `maxEntriesPerCharacter` → evict
 *    lowest-scored
 *
 * Returns the entries that were modified for persistence.
 */
export function summariseMemories(
  entries: MemoryEntry[],
  options: AlayaOptions = {},
): { entries: MemoryEntry[], modified: MemoryEntry[] } {
  const maxUncompressed = options.maxUncompressed ?? DEFAULT_MAX_UNCOMPRESSED
  const summariseAfterMs = options.summariseAfterMs ?? DEFAULT_SUMMARISE_AFTER_MS
  const maxEntries = options.maxEntriesPerCharacter ?? DEFAULT_MAX_ENTRIES
  const scoreOpts = {
    importanceWeight: options.importanceWeight ?? DEFAULT_IMPORTANCE_WEIGHT,
    recencyWeight: options.recencyWeight ?? DEFAULT_RECENCY_WEIGHT,
  }
  const now = Date.now()

  const modified: MemoryEntry[] = []
  let working = [...entries]

  // --- Rule 1: age-based summarization ---
  working = working.map((entry) => {
    if (entry.summary || !entry.content)
      return entry
    if (now - entry.createdAt < summariseAfterMs)
      return entry

    const updated: MemoryEntry = {
      ...entry,
      summary: generateSummary(entry),
      content: '',
      updatedAt: now,
    }
    modified.push(updated)
    return updated
  })

  // --- Rule 2: count-based summarization ---
  const nonSummarised = working.filter(e => !e.summary && e.content)
  if (nonSummarised.length > maxUncompressed) {
    // Sort by composite score ascending (lowest first to summarise)
    nonSummarised.sort((a, b) =>
      compositeScore(a, 1.0, scoreOpts) - compositeScore(b, 1.0, scoreOpts),
    )

    const toSummarise = nonSummarised.slice(0, nonSummarised.length - maxUncompressed)
    const ids = new Set(toSummarise.map(e => e.id))

    working = working.map((entry) => {
      if (!ids.has(entry.id) || entry.summary)
        return entry

      const updated: MemoryEntry = {
        ...entry,
        summary: generateSummary(entry),
        content: '',
        updatedAt: now,
      }
      modified.push(updated)
      return updated
    })
  }

  // --- Rule 3: hard eviction ---
  if (working.length > maxEntries) {
    // Sort by composite score ascending → evict lowest first
    working.sort((a, b) =>
      compositeScore(a, 1.0, scoreOpts) - compositeScore(b, 1.0, scoreOpts),
    )

    // Preserve only the top `maxEntries`
    working = working.slice(working.length - maxEntries)
  }

  return { entries: working, modified }
}
