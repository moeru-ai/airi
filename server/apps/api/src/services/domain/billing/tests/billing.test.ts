import { describe, expect, it } from 'vitest'

import { calculateFluxFromUsage, extractUsageFromBody, priceOpenRouterUsage } from '../billing'

describe('extractUsageFromBody', () => {
  it('returns promptTokens and completionTokens from a normal body', () => {
    const body = { usage: { prompt_tokens: 100, completion_tokens: 200 } }
    expect(extractUsageFromBody(body)).toEqual({ promptTokens: 100, completionTokens: 200, providerUsage: body.usage })
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

  it('retains a null receipt without inventing token usage', () => {
    expect(extractUsageFromBody({ usage: null })).toEqual({ providerUsage: null })
  })

  it('retains invalid usage for reconciliation without inventing token usage', () => {
    expect(extractUsageFromBody({ usage: 0 })).toEqual({ providerUsage: 0 })
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

describe('openRouter cost pricing', () => {
  const pricing = { fluxPerUsd: 1000, multiplier: 1.5 }

  it('uses the reported cost without applying a second cache discount', () => {
    const usage = extractUsageFromBody({ id: 'gen-1', usage: { cost: 0.002, prompt_tokens: 10_000, prompt_tokens_details: { cached_tokens: 9000 } } })
    expect(priceOpenRouterUsage(usage, pricing)).toEqual({ pricing, costUsd: 0.002, microFlux: 3_000_000 })
    expect(usage.providerUsage).toMatchObject({ prompt_tokens_details: { cached_tokens: 9000 } })
  })

  it('preserves a free request as an explicit zero cost', () => {
    expect(priceOpenRouterUsage({ generationId: 'gen-free', providerUsage: { cost: 0 } }, pricing))
      .toEqual({ pricing, costUsd: 0, microFlux: 0 })
  })

  it('multiplies decimal prices without floating point boundary overcharges', () => {
    expect(priceOpenRouterUsage({ generationId: 'gen-decimal', providerUsage: { cost: 0.07 } }, { fluxPerUsd: 100, multiplier: 1 }).microFlux)
      .toBe(7_000_000)
    expect(priceOpenRouterUsage({ generationId: 'gen-small', providerUsage: { cost: 1e-10 } }, pricing).microFlux)
      .toBe(1)
  })

  it.each([undefined, null, -1, '0.01', Number.NaN, Number.POSITIVE_INFINITY])('keeps invalid cost %s pending', (cost) => {
    expect(priceOpenRouterUsage({ generationId: 'gen-invalid', providerUsage: { cost } }, pricing).pendingReason)
      .toBe('missing_or_invalid_cost')
  })

  it('does not treat a BYOK fee as the full inference cost', () => {
    expect(priceOpenRouterUsage({ generationId: 'gen-byok', providerUsage: { cost: 0.001, is_byok: true } }, pricing).pendingReason)
      .toBe('byok_cost_not_supported')
  })

  it('requires a generation ID and rejects unsafe integer charges', () => {
    expect(priceOpenRouterUsage({ providerUsage: { cost: 1 } }, pricing).pendingReason).toBe('missing_generation_id')
    expect(priceOpenRouterUsage({ generationId: 'gen-huge', providerUsage: { cost: 1e20 } }, pricing).pendingReason).toBe('cost_out_of_range')
  })

  it('reads Responses accounting fields and keeps raw cost details', () => {
    const usage = { input_tokens: 100, output_tokens: 20, cost: 0.004, cost_details: { upstream_inference_cost: 0.003 } }
    expect(extractUsageFromBody({ id: 'gen-responses', usage }, 'responses'))
      .toEqual({ generationId: 'gen-responses', providerUsage: usage, promptTokens: 100, completionTokens: 20 })
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
