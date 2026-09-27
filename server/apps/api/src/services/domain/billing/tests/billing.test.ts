import { describe, expect, it } from 'vitest'

import { extractUsageFromBody } from '../../generation-usage'
import { priceLlmCost } from '../billing'

describe('provider cost pricing', () => {
  const pricing = { fluxPerUsd: 1000, multiplier: 1.5 }

  it('uses the reported cost without applying a second cache discount', () => {
    const usage = { costUsd: 0.002, ...extractUsageFromBody({ id: 'gen-1', usage: { prompt_tokens: 10_000, prompt_tokens_details: { cached_tokens: 9000 } } }) }
    expect(priceLlmCost(usage, pricing)).toEqual({ pricing, costUsd: 0.002, requestedFlux: 3 })
    expect(usage.providerUsage).toMatchObject({ prompt_tokens_details: { cached_tokens: 9000 } })
  })

  it('preserves a free request as an explicit zero cost', () => {
    expect(priceLlmCost({ generationId: 'gen-free', costUsd: 0 }, pricing))
      .toEqual({ pricing, costUsd: 0, requestedFlux: 0 })
  })

  it('multiplies decimal prices without floating point boundary overcharges', () => {
    expect(priceLlmCost({ generationId: 'gen-decimal', costUsd: 0.07 }, { fluxPerUsd: 100, multiplier: 1 }).requestedFlux)
      .toBe(7)
    expect(priceLlmCost({ generationId: 'gen-small', costUsd: 1e-10 }, pricing).requestedFlux)
      .toBe(1)
  })

  it.each([
    [0.0002, 1],
    [0.0008, 2],
    [0.002, 3],
    [0.002000000000001, 4],
    [Number.MIN_VALUE, 1],
  ])('rounds each priced request up after multiplying: %s USD', (costUsd, requestedFlux) => {
    expect(priceLlmCost({ generationId: 'gen-rounded', costUsd }, pricing))
      .toEqual({ pricing, costUsd, requestedFlux })
  })

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])('keeps invalid cost %s pending', (costUsd) => {
    expect(priceLlmCost({ generationId: 'gen-invalid', costUsd }, pricing).pendingReason)
      .toBe('missing_or_invalid_cost')
  })

  it('preserves the adapter reason without pricing an unconfirmed cost', () => {
    expect(priceLlmCost({ generationId: 'gen-pending', costUsd: 0.001, pendingReason: 'unconfirmed_provider_cost' }, pricing).pendingReason)
      .toBe('unconfirmed_provider_cost')
  })

  it('requires a generation ID and rejects unsafe integer charges', () => {
    expect(priceLlmCost({ costUsd: 1 }, pricing).pendingReason).toBe('missing_generation_id')
    expect(priceLlmCost({ generationId: 'gen-huge', costUsd: 1e20 }, pricing).pendingReason).toBe('cost_out_of_range')
  })

  it('reads Responses accounting fields and keeps raw cost details', () => {
    const usage = { input_tokens: 100, output_tokens: 20, cost: 0.004, cost_details: { upstream_inference_cost: 0.003 } }
    expect(extractUsageFromBody({ id: 'gen-responses', usage }, 'responses'))
      .toEqual({ generationId: 'gen-responses', providerUsage: usage, promptTokens: 100, completionTokens: 20 })
  })
})
