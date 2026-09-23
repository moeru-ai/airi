import type { InferOutput } from 'valibot'

import type { GenerationProtocol } from '../../../schemas/generation-protocol'

import { boolean, finite, integer, looseObject, minValue, nonEmpty, nullish, number, object, optional, pipe, safeParse, string, unknown } from 'valibot'

/** Price snapshot for OpenRouter credit requests. There are no default sale prices. */
export const openRouterCostPricingSchema = object({
  fluxPerUsd: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  multiplier: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
})
export type OpenRouterCostPricing = InferOutput<typeof openRouterCostPricingSchema>

const tokenCount = nullish(pipe(number(), finite(), integer(), minValue(0)))
const usageSchema = looseObject({
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  input_tokens: tokenCount,
  output_tokens: tokenCount,
})
const envelopeSchema = object({ id: optional(string()), usage: optional(unknown()) })
const costSchema = object({
  cost: pipe(number(), finite(), minValue(0)),
  is_byok: optional(boolean()),
})
const generationIdSchema = pipe(string(), nonEmpty())

/** Unknown cost is kept separate from a provider-reported zero cost. */
export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
  generationId?: string
  providerUsage?: unknown
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
export type OpenRouterCostCharge = {
  pricing: OpenRouterCostPricing
  costUsd: number
  microFlux: number
  pendingReason?: undefined
} | {
  pricing: OpenRouterCostPricing
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

/** Quotes a micro-Flux charge from an OpenRouter receipt, including a price snapshot. */
export function priceOpenRouterUsage(usage: UsageInfo, pricing: OpenRouterCostPricing): OpenRouterCostCharge {
  const cost = safeParse(costSchema, usage.providerUsage)
  if (!cost.success)
    return { pricing, pendingReason: 'missing_or_invalid_cost' }
  if (cost.output.is_byok)
    return { pricing, pendingReason: 'byok_cost_not_supported' }
  if (!safeParse(generationIdSchema, usage.generationId).success)
    return { pricing, pendingReason: 'missing_generation_id' }

  let numerator = 1_000_000n
  let denominator = 1n
  for (const value of [cost.output.cost, pricing.fluxPerUsd, pricing.multiplier]) {
    const [n, d] = decimalFraction(value)
    numerator *= n
    denominator *= d
  }
  const microFlux = (numerator + denominator - 1n) / denominator
  if (microFlux > BigInt(Number.MAX_SAFE_INTEGER - 1_000_000))
    return { pricing, costUsd: cost.output.cost, pendingReason: 'cost_out_of_range' }
  return { pricing, costUsd: cost.output.cost, microFlux: Number(microFlux) }
}

export function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}
