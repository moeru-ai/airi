import type { MemoryRecord, MemorySearchHit } from '../../../types/memory'

import { describe, expect, it } from 'vitest'

import { formatRecalledMemories, rankRecallHits, scoreMemoryHit } from './recall-scoring'

const DAY_MS = 86_400_000
const NOW = 1_000 * DAY_MS

function makeHit(similarity: number, overrides: Partial<MemoryRecord> = {}): MemorySearchHit {
  const record: MemoryRecord = {
    id: overrides.id ?? 'r',
    character: 'airi',
    userId: 'local',
    text: overrides.text ?? 'a memory',
    type: 'fact',
    embedding: [1, 0, 0],
    salience: overrides.salience ?? 1,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    ...overrides,
  }
  return { record, similarity }
}

const PARAMS = { recencyHalfLifeMs: 30 * DAY_MS }

describe('scoreMemoryHit', () => {
  /**
   * @example
   * Same record, higher similarity -> higher score.
   */
  it('increases with similarity', () => {
    const low = scoreMemoryHit(makeHit(0.4), NOW, PARAMS)
    const high = scoreMemoryHit(makeHit(0.8), NOW, PARAMS)
    expect(high).toBeGreaterThan(low)
  })

  /**
   * @example
   * A memory one half-life old has ~half the recency weight of a fresh one.
   */
  it('decays with age by the configured half-life', () => {
    const fresh = scoreMemoryHit(makeHit(0.8, { updatedAt: NOW }), NOW, PARAMS)
    const oneHalfLife = scoreMemoryHit(makeHit(0.8, { updatedAt: NOW - 30 * DAY_MS }), NOW, PARAMS)
    expect(oneHalfLife).toBeCloseTo(fresh * 0.5, 5)
  })

  /**
   * @example
   * Higher salience gently boosts the score; a low-salience hit is not zeroed out.
   */
  it('boosts with salience without zeroing low salience', () => {
    const salient = scoreMemoryHit(makeHit(0.6, { salience: 10 }), NOW, PARAMS)
    const plain = scoreMemoryHit(makeHit(0.6, { salience: 0 }), NOW, PARAMS)
    expect(salient).toBeGreaterThan(plain)
    expect(plain).toBeGreaterThan(0)
  })
})

describe('rankRecallHits', () => {
  /**
   * @example
   * A recent, slightly-less-similar memory outranks a stale, more-similar one.
   */
  it('re-ranks so recency can overcome a small similarity gap', () => {
    const staleButSimilar = makeHit(0.9, { id: 'stale', updatedAt: NOW - 365 * DAY_MS })
    const recentLessSimilar = makeHit(0.7, { id: 'recent', updatedAt: NOW })

    const ranked = rankRecallHits([staleButSimilar, recentLessSimilar], NOW, PARAMS)
    expect(ranked.map(h => h.record.id)).toEqual(['recent', 'stale'])
  })

  /**
   * @example
   * Does not mutate the input array.
   */
  it('returns a new array without mutating the input', () => {
    const input = [makeHit(0.5, { id: 'a' }), makeHit(0.9, { id: 'b' })]
    const ranked = rankRecallHits(input, NOW, PARAMS)
    expect(ranked).not.toBe(input)
    expect(input.map(h => h.record.id)).toEqual(['a', 'b'])
  })
})

describe('formatRecalledMemories', () => {
  /**
   * @example
   * Empty list -> '' so the caller can clear its context line on a no-hit turn.
   */
  it('returns empty string for no records', () => {
    expect(formatRecalledMemories([])).toBe('')
  })

  /**
   * @example
   * Renders a framing line followed by one bullet per memory.
   */
  it('renders a framing line and one bullet per memory', () => {
    const text = formatRecalledMemories([
      makeHit(1, { text: 'User prefers tea' }).record,
      makeHit(1, { text: 'Lives in Berlin' }).record,
    ])
    const lines = text.split('\n')
    expect(lines[0]).toContain('Things you remember')
    expect(lines).toContain('- User prefers tea')
    expect(lines).toContain('- Lives in Berlin')
  })
})
