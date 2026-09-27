import type { InferOutput } from 'valibot'

import type { UsageInfo } from '../generation-usage'

import { finite, integer, minValue, nonEmpty, number, object, pipe, record, safeParse, string } from 'valibot'

/** Price snapshot for provider-reported USD costs. There are no default sale prices. */
export const costPricingSchema = object({
  fluxPerUsd: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  multiplier: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
})
export type CostPricing = InferOutput<typeof costPricingSchema>

/** Authorization-time policy remains fixed when a pending request is reconciled. */
export const billingPolicySchema = object({
  minimumBalance: pipe(number(), finite(), integer(), minValue(1)),
  costPricing: record(pipe(string(), nonEmpty()), costPricingSchema),
})
export type BillingPolicy = InferOutput<typeof billingPolicySchema>

/** Standard adapter output. Missing cost remains unresolved, including explicit price-table adapters. */
export interface CostUsage extends UsageInfo {
  source: 'provider_reported' | 'model_price_table'
  costUsd?: number
  pendingReason?: string
}

const costSchema = pipe(number(), finite(), minValue(0))
const generationIdSchema = pipe(string(), nonEmpty())

/** A pending receipt must be reconciled, never priced with the token fallback. */
export type CostCharge = {
  pricing: CostPricing
  costUsd: number
  microFlux: number
  pendingReason?: undefined
} | {
  pricing: CostPricing
  costUsd?: number
  microFlux?: undefined
  pendingReason: string
}

// Decimal multiplication prevents values such as 0.07 * 100 from crossing an integer boundary.
function decimalFraction(value: number): [bigint, bigint] {
  const [coefficient, exponent = '0'] = value.toString().split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  const scale = fraction.length - Number(exponent)
  const numerator = BigInt(whole + fraction)
  return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n]
}

/** Quotes a micro-Flux charge from normalized USD usage, without provider wire knowledge. */
export function priceLlmCost(usage: Pick<CostUsage, 'costUsd' | 'pendingReason' | 'generationId'>, pricing: CostPricing): CostCharge {
  if (usage.pendingReason !== undefined)
    return { pricing, costUsd: usage.costUsd, pendingReason: usage.pendingReason }
  const cost = safeParse(costSchema, usage.costUsd)
  if (!cost.success)
    return { pricing, pendingReason: 'missing_or_invalid_cost' }
  if (!safeParse(generationIdSchema, usage.generationId).success)
    return { pricing, pendingReason: 'missing_generation_id' }

  let numerator = 1_000_000n
  let denominator = 1n
  for (const value of [cost.output, pricing.fluxPerUsd, pricing.multiplier]) {
    const [n, d] = decimalFraction(value)
    numerator *= n
    denominator *= d
  }
  const microFlux = (numerator + denominator - 1n) / denominator
  if (microFlux > BigInt(Number.MAX_SAFE_INTEGER - 1_000_000))
    return { pricing, costUsd: cost.output, pendingReason: 'cost_out_of_range' }
  return { pricing, costUsd: cost.output, microFlux: Number(microFlux) }
}
