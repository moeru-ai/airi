import { describe, expect, it } from 'vitest'

import {
  getRuntimeFactFreshness,
  isRuntimeFactUsable,
  toRuntimeFactSummary,
} from './runtime-facts'

describe('runtime Facts', () => {
  it('calculates freshness based on TTL', () => {
    const fact = {
      value: 'foo',
      source: 'executor_probe' as const,
      probedAt: 1000,
      confidence: 'high' as const,
      ttlMs: 5000,
    }

    expect(getRuntimeFactFreshness(fact, 1000)).toBe('fresh')
    expect(getRuntimeFactFreshness(fact, 6000)).toBe('fresh') // Exactly at TTL
    expect(getRuntimeFactFreshness(fact, 6001)).toBe('stale') // Past TTL
  })

  it('checks usability based on freshness and confidence', () => {
    const freshHighFact = {
      value: 'foo',
      source: 'executor_probe' as const,
      probedAt: 1000,
      confidence: 'high' as const,
      ttlMs: 5000,
    }

    // Usable if fresh and high matched
    expect(isRuntimeFactUsable(freshHighFact, { now: 1000 })).toBe(true)
    expect(isRuntimeFactUsable(freshHighFact, { minConfidence: 'high', now: 1000 })).toBe(true)

    // Not usable if stale
    expect(isRuntimeFactUsable(freshHighFact, { now: 6001 })).toBe(false)

    // Not usable if confidence is lower than minConfidence
    const freshLowFact = { ...freshHighFact, confidence: 'low' as const }
    expect(isRuntimeFactUsable(freshLowFact, { minConfidence: 'medium', now: 1000 })).toBe(false)
  })

  it('summarizes correctly', () => {
    const fact = {
      value: 'secret',
      source: 'executor_probe' as const,
      probedAt: 1000,
      confidence: 'medium' as const,
      ttlMs: 5000,
    }

    const summary = toRuntimeFactSummary(fact, 1000)
    expect(summary).toEqual({
      source: 'executor_probe',
      probedAt: 1000,
      confidence: 'medium',
      freshness: 'fresh',
    })

    // Value should not be leaked in summary
    expect('value' in summary).toBe(false)
  })
})
