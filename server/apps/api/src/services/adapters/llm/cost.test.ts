import { describe, expect, it } from 'vitest'

import { resolveProviderCostAdapter } from './cost'

describe('provider cost adapters', () => {
  const adapter = resolveProviderCostAdapter('openrouter.ai')!

  it('normalizes OpenRouter credit costs and retains raw usage', () => {
    const usage = { generationId: 'gen-1', providerUsage: { cost: 0.002, prompt_tokens_details: { cached_tokens: 900 } } }
    expect(adapter.provider).toBe('openrouter')
    expect(adapter.extractUsage(usage)).toEqual({ ...usage, costUsd: 0.002 })
  })

  it('retains an explicit zero cost', () => {
    expect(adapter.extractUsage({ providerUsage: { cost: 0 } }).costUsd).toBe(0)
  })

  it.each([undefined, null, -1, '0.01', Number.NaN, Number.POSITIVE_INFINITY])('keeps invalid wire cost pending: %s', (cost) => {
    expect(adapter.extractUsage({ providerUsage: { cost } }).pendingReason).toBe('missing_or_invalid_cost')
  })

  it('does not treat a BYOK fee as full inference cost', () => {
    expect(adapter.extractUsage({ providerUsage: { cost: 0.001, is_byok: true } }))
      .toMatchObject({ pendingReason: 'byok_cost_not_supported' })
  })

  it('does not infer cost support for an unknown hostname', () => {
    expect(resolveProviderCostAdapter('another.example')).toBeUndefined()
    expect(resolveProviderCostAdapter('openrouter.ai.example')).toBeUndefined()
  })
})
