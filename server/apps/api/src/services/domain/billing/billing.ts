import type { InferOutput } from 'valibot'

import type { GenerationProtocol } from '../../../schemas/generation-protocol'

import { finite, integer, looseObject, minValue, nonEmpty, nullish, number, object, optional, pipe, safeParse, string, unknown } from 'valibot'

/** Price snapshot for provider-reported USD costs. There are no default sale prices. */
export const costPricingSchema = object({
  fluxPerUsd: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  multiplier: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
})
export type CostPricing = InferOutput<typeof costPricingSchema>

const tokenCount = nullish(pipe(number(), finite(), integer(), minValue(0)))
const usageSchema = looseObject({
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  input_tokens: tokenCount,
  output_tokens: tokenCount,
})
const envelopeSchema = object({ id: optional(string()), usage: optional(unknown()) })
const costSchema = pipe(number(), finite(), minValue(0))
const generationIdSchema = pipe(string(), nonEmpty())

/** Unknown cost is kept separate from a provider-reported zero cost. */
export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
  generationId?: string
  providerUsage?: unknown
}

/** Provider adapters normalize costs to USD and retain the original usage for audit. */
export interface CostUsage extends UsageInfo {
  costUsd?: number
  pendingReason?: string
}

/** Reads accounting fields without changing the response forwarded to the client. */
export function extractUsageFromBody(body: unknown, protocol: GenerationProtocol = 'chat-completions'): UsageInfo {
  const envelope = safeParse(envelopeSchema, body)
  if (!envelope.success)
    return {}
  const usage = safeParse(usageSchema, envelope.output.usage)
  return {
    generationId: envelope.output.id,
    providerUsage: envelope.output.usage,
    promptTokens: usage.success ? (protocol === 'responses' ? usage.output.input_tokens : usage.output.prompt_tokens) ?? undefined : undefined,
    completionTokens: usage.success ? (protocol === 'responses' ? usage.output.output_tokens : usage.output.completion_tokens) ?? undefined : undefined,
  }
}

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
export function priceLlmCost(usage: CostUsage, pricing: CostPricing): CostCharge {
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

export function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}
