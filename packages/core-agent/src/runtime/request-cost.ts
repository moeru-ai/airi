import type { ModelMetadata } from '@proj-airi/provider-inference'

import type { LlmUsage } from '../types/llm'

/** Estimated cost of one request in the catalog currency. */
export interface RequestCost {
  amount: number
  currency: string
}

type PricingUnit = NonNullable<ModelMetadata['pricing']>['units'][number]

function unitRate(unit: PricingUnit | undefined, tokens: number) {
  if (!unit || unit.unit !== 'millionTokens')
    return undefined
  if (unit.strategy === 'fixed')
    return unit.rate
  if (unit.strategy === 'tiered')
    return unit.tiers.find(tier => tier.upTo === 'infinity' || tokens <= tier.upTo)?.rate
  // Lookup prices depend on request parameters that usage does not report.
  return undefined
}

/**
 * Estimates the cost of one request from its reported token usage.
 *
 * Use when:
 * - A spending limit counts what runs cost.
 *
 * Expects:
 * - Usage that the provider reported or the runtime estimated. Unavailable usage has no cost.
 *
 * Returns:
 * - The cost, or undefined when the price or the usage is unknown. Cached input counts at the full input rate, so the estimate never runs low.
 */
export function estimateRequestCost(pricing: ModelMetadata['pricing'] | undefined, usage: LlmUsage): RequestCost | undefined {
  if (!pricing || usage.source === 'unavailable' || usage.inputTokens === undefined || usage.outputTokens === undefined)
    return undefined
  // Catalog tiers follow the prompt size, for both input and output rates.
  const input = unitRate(pricing.units.find(unit => unit.name === 'textInput'), usage.inputTokens)
  const output = unitRate(pricing.units.find(unit => unit.name === 'textOutput'), usage.inputTokens)
  if (input === undefined || output === undefined)
    return undefined
  return {
    amount: (usage.inputTokens * input + usage.outputTokens * output) / 1_000_000,
    currency: pricing.currency ?? 'USD',
  }
}
