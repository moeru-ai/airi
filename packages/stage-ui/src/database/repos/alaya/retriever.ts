import type { AlayaOptions, MemoryEntry, MemoryQuery, MemorySearchResult } from './types'

import { compositeScore } from './scorer'

/**
 * Lightweight in-memory keyword search over stored memories.
 *
 * V1 uses simple substring matching + normalization (lowercase, strip
 * punctuation). V2 may replace this with WASM-embedding similarity or
 * a FTS index.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Computes a keyword-relevance score for a single entry.
 *
 * Matches each query word against the entry content + tags + summary.
 * Returns a value in [0, 1] where 1 means all query words were found.
 */
function keywordRelevance(entry: MemoryEntry, queryText: string): number {
  const searchTarget = [
    entry.content,
    ...entry.tags,
    entry.summary ?? '',
  ].join(' ')

  const normalizedTarget = normalize(searchTarget)
  const queryWords = normalize(queryText).split(' ').filter(Boolean)

  if (queryWords.length === 0) {
    return 1.0
  }

  let hits = 0
  for (const word of queryWords) {
    if (normalizedTarget.includes(word)) {
      hits++
    }
  }

  return hits / queryWords.length
}

/**
 * Retrieves and ranks memory entries matching a query.
 *
 * Pipeline:
 * 1. Fetch all entries for the character
 * 2. Filter by minimum importance threshold
 * 3. Filter by tags (OR semantics)
 * 4. Compute keyword relevance (when `query.text` is present)
 * 5. Compute composite score (importance + recency × relevance)
 * 6. Sort descending by score
 * 7. Cap results at `query.limit`
 *
 * NOTE: Access-tracking updates (lastAccessedAt / accessCount) are NOT
 * performed here — the caller is responsible for touching retrieved
 * entries via `alayaRepo.touch` if needed.
 */
export async function retrieve(
  entries: MemoryEntry[],
  query: MemoryQuery,
  options: Pick<AlayaOptions, 'importanceWeight' | 'recencyWeight'> = {},
): Promise<MemorySearchResult[]> {
  const limit = query.limit ?? 10
  const minImportance = query.minImportance ?? 0
  const hasTagFilter = query.tags && query.tags.length > 0

  // --- Stage 1: filter ---
  const candidates: MemoryEntry[] = []

  for (const entry of entries) {
    // Skip summarized-only entries with no tags (they are archival)
    if (!entry.content && !entry.summary) {
      continue
    }

    if (entry.importance < minImportance) {
      continue
    }

    if (hasTagFilter) {
      const queryTags = query.tags!
      if (!queryTags.some(t => entry.tags.includes(t))) {
        continue
      }
    }

    candidates.push(entry)
  }

  // --- Stage 2: score ---
  const scored: MemorySearchResult[] = candidates.map((entry) => {
    const relevance = query.text
      ? keywordRelevance(entry, query.text)
      : 1.0

    return {
      entry,
      score: compositeScore(entry, relevance, options),
    }
  })

  // --- Stage 3: sort + limit ---
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}

/**
 * Returns the N most recent memories regardless of search query.
 * Useful for building a context window from the latest memories.
 */
export async function recent(
  entries: MemoryEntry[],
  characterId: string,
  n = 10,
): Promise<MemorySearchResult[]> {
  // Filter to this character, sort by createdAt descending
  const filtered = entries
    .filter(e => e.characterId === characterId)
    .sort((a, b) => b.createdAt - a.createdAt)

  return filtered.slice(0, n).map(entry => ({
    entry,
    score: compositeScore(entry),
  }))
}

export { compositeScore }
