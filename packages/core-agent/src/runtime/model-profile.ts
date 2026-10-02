import type { ModelMetadata } from '@proj-airi/provider-inference'

import type { LlmUsage } from '../types/llm'

/** A quality tier that the user assigns to a model. The catalog has no quality signal, so only the user sets it. */
export type ModelTier = 'fast' | 'default' | 'strong'

/** Ranks tiers, so a task that needs `default` also accepts `strong`. */
export const MODEL_TIER_RANK: Record<ModelTier, number> = { fast: 0, default: 1, strong: 2 }

/** Hard conditions that a task needs from a model. */
export interface ModelRequirements {
  tools?: boolean
  vision?: boolean
  reasoning?: boolean
  /** Smallest context window in tokens. */
  minContext?: number
}

/**
 * What the host knows about one configured model.
 *
 * An absent ability, context length, price, tier, or latency is unknown, never false.
 */
export interface ModelProfile {
  providerId: string
  model: string
  abilities: { tools?: boolean, vision?: boolean, reasoning?: boolean }
  contextLength?: number
  pricing?: ModelMetadata['pricing']
  tier?: ModelTier
  /** Average first-token delay of earlier requests to this model. */
  latency?: ModelLatency
}

/** Moving average of first-token delay. */
export interface ModelLatency {
  firstTokenMs: number
  samples: number
}

/** Result of a requirements check. Unknown facts are listed apart from missing ones. */
export type RequirementsCheck
  = | { ok: true }
    | { ok: false, missing: string[], unknown: string[] }

/**
 * Checks hard task requirements against a profile.
 *
 * Use when:
 * - A router filters candidates, or the host explains why a configured model cannot serve a task.
 *
 * Returns:
 * - `ok` only when every requirement is known to hold. A requirement with an unknown fact fails as unknown.
 */
export function checkRequirements(profile: ModelProfile, requirements: ModelRequirements): RequirementsCheck {
  const missing: string[] = []
  const unknown: string[] = []
  for (const ability of ['tools', 'vision', 'reasoning'] as const) {
    if (!requirements[ability])
      continue
    const known = profile.abilities[ability]
    if (known === undefined)
      unknown.push(ability)
    else if (!known)
      missing.push(ability)
  }
  if (requirements.minContext !== undefined) {
    if (profile.contextLength === undefined)
      unknown.push('context')
    else if (profile.contextLength < requirements.minContext)
      missing.push('context')
  }
  return missing.length || unknown.length ? { ok: false, missing, unknown } : { ok: true }
}

/** Learned facts that a host has about one model, beyond its catalog entry. */
export interface ModelObservations {
  /** False after a request failed because the model rejected tools. */
  toolsCompatible?: boolean
  latency?: ModelLatency
  tier?: ModelTier
}

/**
 * Builds a profile from the catalog entry and the host's observations.
 * A learned tool failure overrides the catalog, because the endpoint is the evidence.
 */
export function createModelProfile(
  model: { providerId: string, model: string, contextLength?: number, metadata?: ModelMetadata },
  observations: ModelObservations = {},
): ModelProfile {
  const abilities = model.metadata?.abilities
  return {
    providerId: model.providerId,
    model: model.model,
    abilities: {
      tools: observations.toolsCompatible === false ? false : abilities?.functionCall,
      vision: abilities?.vision,
      reasoning: abilities?.reasoning,
    },
    contextLength: model.contextLength,
    pricing: model.metadata?.pricing,
    tier: observations.tier,
    latency: observations.latency,
  }
}

/** Weight of the newest sample. Recent requests reflect the current network and provider load. */
const LATENCY_WEIGHT = 0.2

/** Adds one first-token delay to a moving average. */
export function observeLatency(previous: ModelLatency | undefined, firstTokenMs: number): ModelLatency {
  if (!previous)
    return { firstTokenMs, samples: 1 }
  return {
    firstTokenMs: previous.firstTokenMs + LATENCY_WEIGHT * (firstTokenMs - previous.firstTokenMs),
    samples: previous.samples + 1,
  }
}

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
