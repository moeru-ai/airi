import { describe, expect, it } from 'vitest'

import { calculateFluxFromUsage } from '../billing'

describe('calculateFluxFromUsage', () => {
  it('calculates flux based on total tokens and rate', () => {
    const usage = { promptTokens: 500, completionTokens: 500 }
    // 1000 tokens * 1 per 1k = 1
    expect(calculateFluxFromUsage(usage, 1, 5)).toBe(1)
  })

  it('applies ceiling to fractional flux values', () => {
    const usage = { promptTokens: 500, completionTokens: 501 }
    // 1001 tokens * 1 per 1k = 1.001 → ceil → 2
    expect(calculateFluxFromUsage(usage, 1, 5)).toBe(2)
  })

  it('enforces a minimum of 1 flux even when calculation yields 0', () => {
    const usage = { promptTokens: 1, completionTokens: 1 }
    // 2 tokens * 1 per 1k = 0.002 → ceil → 1, max(1, 1) = 1
    expect(calculateFluxFromUsage(usage, 1, 5)).toBe(1)
  })

  it('enforces minimum of 1 flux when tokens are zero', () => {
    const usage = { promptTokens: 0, completionTokens: 0 }
    // 0 tokens * anything = 0 → ceil → 0, max(1, 0) = 1
    expect(calculateFluxFromUsage(usage, 1, 5)).toBe(1)
  })

  it('falls back to fallbackRate when promptTokens is missing', () => {
    const usage = { completionTokens: 500 }
    expect(calculateFluxFromUsage(usage, 1, 7)).toBe(7)
  })

  it('falls back to fallbackRate when completionTokens is missing', () => {
    const usage = { promptTokens: 500 }
    expect(calculateFluxFromUsage(usage, 1, 7)).toBe(7)
  })

  it('falls back to fallbackRate when usage is empty', () => {
    expect(calculateFluxFromUsage({}, 1, 3)).toBe(3)
  })

  it('uses a higher fluxPer1kTokens multiplier correctly', () => {
    const usage = { promptTokens: 1000, completionTokens: 1000 }
    // 2000 tokens * 5 per 1k = 10
    expect(calculateFluxFromUsage(usage, 5, 1)).toBe(10)
  })

  it('uses a fractional fluxPer1kTokens multiplier with ceiling', () => {
    const usage = { promptTokens: 200, completionTokens: 200 }
    // 400 tokens * 0.5 per 1k = 0.2 → ceil → 1, max(1, 1) = 1
    expect(calculateFluxFromUsage(usage, 0.5, 3)).toBe(1)
  })

  it('handles very large token counts', () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000 }
    // 2_000_000 tokens * 1 per 1k = 2000
    expect(calculateFluxFromUsage(usage, 1, 5)).toBe(2000)
  })

  it('handles exact 1k token boundary without ceiling', () => {
    const usage = { promptTokens: 500, completionTokens: 500 }
    // 1000 tokens * 2 per 1k = 2 (exact, no ceiling needed)
    expect(calculateFluxFromUsage(usage, 2, 5)).toBe(2)
  })

  it('returns fallbackRate when both token fields are undefined (not null)', () => {
    const usage = { promptTokens: undefined, completionTokens: undefined }
    expect(calculateFluxFromUsage(usage, 1, 99)).toBe(99)
  })
})
