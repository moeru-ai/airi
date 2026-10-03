import type { InferOutput } from 'valibot'

import type { UsageInfo } from '../generation-usage'

import { boolean, finite, integer, minValue, nonEmpty, number, object, optional, pipe, record, safeInteger, safeParse, string, union } from 'valibot'

/** Number of micro-Flux units in one integer wallet Flux. */
export const MICRO_FLUX_PER_FLUX = 1_000_000

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
  costMicroFlux: number
  pendingReason?: undefined
} | {
  pricing: CostPricing
  costUsd?: number
  costMicroFlux?: undefined
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

/** Quotes a micro-Flux fee rounded up per usage event from normalized USD usage, without provider wire knowledge. */
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
    const [factorNumerator, factorDenominator] = decimalFraction(value)
    numerator *= factorNumerator
    denominator *= factorDenominator
  }
  const costMicroFlux = (numerator + denominator - 1n) / denominator
  if (costMicroFlux > BigInt(Number.MAX_SAFE_INTEGER))
    return { pricing, costUsd: cost.output, pendingReason: 'cost_out_of_range' }
  return { pricing, costUsd: cost.output, costMicroFlux: Number(costMicroFlux) }
}

/** Snapshot of the character price, fixed before speech dispatch. */
export const speechPricingSchema = object({
  fluxPer1kChars: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
})
export type SpeechPricing = InferOutput<typeof speechPricingSchema>

/** Prices metered speech characters with decimal arithmetic before integer wallet settlement. */
export function priceSpeechUsage(units: number, pricing: SpeechPricing): number {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error('Speech units must be a non-negative safe integer')
  const [numerator, denominator] = decimalFraction(pricing.fluxPer1kChars)
  const divisor = denominator * 1000n
  const fee = (BigInt(units) * numerator * 1_000_000n + divisor - 1n) / divisor
  if (fee > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Speech cost is out of range')
  return Number(fee)
}

/** Confirmed fees from service-owned pricing rules enter the wallet through this provider-neutral contract. */
export const confirmedUsageSchema = object({
  userId: pipe(string(), nonEmpty()),
  service: pipe(string(), nonEmpty()),
  requestId: pipe(string(), nonEmpty()),
  model: pipe(string(), nonEmpty()),
  method: pipe(string(), nonEmpty()),
  costSource: pipe(string(), nonEmpty()),
  costMicroFlux: pipe(number(), safeInteger(), minValue(0)),
  pricing: record(pipe(string(), nonEmpty()), union([pipe(number(), finite()), string(), boolean()])),
  provider: optional(pipe(string(), nonEmpty())),
  turnId: optional(pipe(string(), nonEmpty())),
})
export type ConfirmedUsage = InferOutput<typeof confirmedUsageSchema>
