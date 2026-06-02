import type { MemoryRecord, MemorySearchHit } from '../../../types/memory'

/**
 * Parameters for re-ranking recalled memories.
 */
export interface RecallRankParams {
  /**
   * Half-life (ms) of the recency factor applied to a memory's `updatedAt`: a memory loses half of
   * its recency weight every `recencyHalfLifeMs`.
   */
  recencyHalfLifeMs: number
}

/**
 * Hybrid recall score for one search hit.
 *
 * `score = similarity × recency × (1 + ln(1 + salience))`, where
 * `recency = 0.5 ^ (ageMs / halfLife)`.
 *
 * The salience term uses `1 + log1p` (not bare `log1p`) so a low-salience but highly-similar memory
 * is still surfaced rather than zeroed out; salience only gently boosts ties.
 */
export function scoreMemoryHit(hit: MemorySearchHit, nowMs: number, params: RecallRankParams): number {
  const ageMs = Math.max(0, nowMs - hit.record.updatedAt)
  const recency = 0.5 ** (ageMs / params.recencyHalfLifeMs)
  const salienceBoost = 1 + Math.log1p(Math.max(0, hit.record.salience))
  return hit.similarity * recency * salienceBoost
}

/**
 * Re-ranks similarity-ordered search hits by the hybrid {@link scoreMemoryHit}, best-first.
 *
 * Expects:
 * - `hits` already passed the similarity threshold and top-k cut in the store search; this only
 *   reorders them (a recent, salient memory can outrank a marginally more similar but stale one).
 *
 * Returns:
 * - A new array; the input is not mutated.
 */
export function rankRecallHits(hits: MemorySearchHit[], nowMs: number, params: RecallRankParams): MemorySearchHit[] {
  return hits
    .map(hit => ({ hit, score: scoreMemoryHit(hit, nowMs, params) }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.hit)
}

/**
 * Formats recalled memories into the `[Memory]` context block injected into the prompt.
 *
 * Returns '' for an empty list so the caller can clear its context line on a no-hit turn (an empty
 * `ReplaceSelf` update that {@link formatContextPromptText} skips).
 *
 * Before:
 * - [{ text: 'User prefers tea' }, { text: 'Lives in Berlin' }]
 *
 * After:
 * - "Things you remember ...:\n- User prefers tea\n- Lives in Berlin"
 */
export function formatRecalledMemories(records: MemoryRecord[]): string {
  if (records.length === 0)
    return ''

  return [
    'Things you remember about the user and your shared history (use naturally, do not recite verbatim):',
    ...records.map(record => `- ${record.text}`),
  ].join('\n')
}
