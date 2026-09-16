import { describe, expect, it } from 'vitest'

import { calculateFluxFromUsage, extractUsageFromBody } from '../billing'

describe('extractUsageFromBody', () => {
  it('returns promptTokens and completionTokens from a normal body', () => {
    const body = { usage: { prompt_tokens: 100, completion_tokens: 200 } }
    expect(extractUsageFromBody(body)).toEqual({ promptTokens: 100, completionTokens: 200 })
  })

  it('returns empty object when body has no usage field', () => {
    expect(extractUsageFromBody({ model: 'gpt-4' })).toEqual({})
  })

  it('returns empty object for null body', () => {
    expect(extractUsageFromBody(null)).toEqual({})
  })

  it('returns empty object for undefined body', () => {
    expect(extractUsageFromBody(undefined)).toEqual({})
  })

  it('returns empty object when usage is null', () => {
    expect(extractUsageFromBody({ usage: null })).toEqual({})
  })

  it('returns empty object when usage is falsy zero-like value (0)', () => {
    expect(extractUsageFromBody({ usage: 0 })).toEqual({})
  })

  it('returns only promptTokens when completion_tokens is missing', () => {
    const body = { usage: { prompt_tokens: 50 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBe(50)
    expect(result.completionTokens).toBeUndefined()
  })

  it('returns only completionTokens when prompt_tokens is missing', () => {
    const body = { usage: { completion_tokens: 75 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBe(75)
  })

  it('treats explicit null fields in usage as undefined', () => {
    const body = { usage: { prompt_tokens: null, completion_tokens: null } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBeUndefined()
  })

  it('handles zero token values correctly', () => {
    const body = { usage: { prompt_tokens: 0, completion_tokens: 0 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBe(0)
    expect(result.completionTokens).toBe(0)
  })
})

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
