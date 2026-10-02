import { describe, expect, it } from 'vitest'

import { estimateRequestCost } from './request-cost'

const pricing = {
  currency: 'USD' as const,
  units: [
    { name: 'textInput' as const, strategy: 'tiered' as const, unit: 'millionTokens' as const, tiers: [{ rate: 1, upTo: 200_000 }, { rate: 2, upTo: 'infinity' as const }] },
    { name: 'textOutput' as const, strategy: 'fixed' as const, unit: 'millionTokens' as const, rate: 4 },
  ],
}

describe('request cost', () => {
  it('estimates cost from usage, with the tier that the prompt size selects', () => {
    expect(estimateRequestCost(pricing, { inputTokens: 1_000_000, outputTokens: 500_000, source: 'reported' })).toEqual({ amount: 2 + 2, currency: 'USD' })
    expect(estimateRequestCost(pricing, { inputTokens: 100_000, outputTokens: 0, source: 'estimated' })).toEqual({ amount: 0.1, currency: 'USD' })
  })

  it('leaves cost unknown without a price or usage', () => {
    expect(estimateRequestCost(undefined, { inputTokens: 1, outputTokens: 1, source: 'reported' })).toBeUndefined()
    expect(estimateRequestCost(pricing, { source: 'unavailable' })).toBeUndefined()
    expect(estimateRequestCost({ units: [{ name: 'textInput', strategy: 'lookup', unit: 'millionTokens', lookup: { prices: {}, pricingParams: [] } }] }, { inputTokens: 1, outputTokens: 1, source: 'reported' })).toBeUndefined()
  })
})
