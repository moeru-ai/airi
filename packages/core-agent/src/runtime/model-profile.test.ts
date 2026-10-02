import { describe, expect, it } from 'vitest'

import { checkRequirements, createModelProfile, estimateRequestCost, observeLatency } from './model-profile'

const pricing = {
  currency: 'USD' as const,
  units: [
    { name: 'textInput' as const, strategy: 'tiered' as const, unit: 'millionTokens' as const, tiers: [{ rate: 1, upTo: 200_000 }, { rate: 2, upTo: 'infinity' as const }] },
    { name: 'textOutput' as const, strategy: 'fixed' as const, unit: 'millionTokens' as const, rate: 4 },
  ],
}

describe('model profiles', () => {
  it('builds a profile from the catalog, and a learned tool failure overrides it', () => {
    const profile = createModelProfile(
      { providerId: 'openai', model: 'gpt', contextLength: 128_000, metadata: { abilities: { functionCall: true, vision: true }, pricing } },
      { toolsCompatible: false, tier: 'strong' },
    )

    expect(profile).toMatchObject({ abilities: { tools: false, vision: true, reasoning: undefined }, contextLength: 128_000, tier: 'strong' })
  })

  it('separates missing requirements from unknown ones', () => {
    const custom = createModelProfile({ providerId: 'custom', model: 'local' })
    const known = createModelProfile({ providerId: 'openai', model: 'gpt', contextLength: 32_000, metadata: { abilities: { functionCall: true, vision: false } } })

    expect(checkRequirements(known, { tools: true })).toEqual({ ok: true })
    expect(checkRequirements(known, { vision: true, minContext: 64_000 })).toEqual({ ok: false, missing: ['vision', 'context'], unknown: [] })
    expect(checkRequirements(custom, { tools: true, minContext: 1 })).toEqual({ ok: false, missing: [], unknown: ['tools', 'context'] })
  })

  it('estimates cost from usage, with the tier that the prompt size selects', () => {
    expect(estimateRequestCost(pricing, { inputTokens: 1_000_000, outputTokens: 500_000, source: 'reported' })).toEqual({ amount: 2 + 2, currency: 'USD' })
    expect(estimateRequestCost(pricing, { inputTokens: 100_000, outputTokens: 0, source: 'estimated' })).toEqual({ amount: 0.1, currency: 'USD' })
  })

  it('leaves cost unknown without a price or usage', () => {
    expect(estimateRequestCost(undefined, { inputTokens: 1, outputTokens: 1, source: 'reported' })).toBeUndefined()
    expect(estimateRequestCost(pricing, { source: 'unavailable' })).toBeUndefined()
    expect(estimateRequestCost({ units: [{ name: 'textInput', strategy: 'lookup', unit: 'millionTokens', lookup: { prices: {}, pricingParams: [] } }] }, { inputTokens: 1, outputTokens: 1, source: 'reported' })).toBeUndefined()
  })

  it('averages first-token delay toward recent samples', () => {
    const first = observeLatency(undefined, 1000)
    expect(first).toEqual({ firstTokenMs: 1000, samples: 1 })
    expect(observeLatency(first, 500)).toEqual({ firstTokenMs: 900, samples: 2 })
  })
})
