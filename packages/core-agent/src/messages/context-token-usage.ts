import type { ContextTokenBudget } from './context-budget'

/** Where an input-token number came from. An estimate must not use a counted source. */
export type ContextTokenSource
  = | 'provider-counted'
    | 'local-tokenizer'
    | 'estimated'
    | 'unavailable'

/**
 * Token measurement for one provider request.
 * The payload is the projected request, including the system prompt, tool schemas,
 * current input, tool results, and protocol wrapping that the projector included.
 */
export interface ContextTokenUsage {
  inputTokens: number
  outputReserveTokens: number
  contextWindowTokens: number
  source: ContextTokenSource
  model: string
  providerId: string
}

/** Counts one projected request without a network call. */
export interface LocalTokenTokenizer {
  countTokens: (payload: unknown) => number
}

/** Counts one projected request with a provider API. The caller selects the capability. */
export interface ContextTokenCounter {
  capability: 'openai-responses-input-tokens' | 'anthropic-messages-count-tokens' | 'gemini-count-tokens'
  countInputTokens: (payload: unknown, signal?: AbortSignal) => Promise<number>
}

/** Exact provider counts that are safe to reuse for the same payload, model, and provider. */
export interface ContextTokenCountCache {
  read: (key: string) => number | undefined
  write: (key: string, inputTokens: number) => void
}

export interface ContextTokenIdentity {
  model: string
  providerId: string
  contextWindowTokens?: number
  outputReserveTokens: number
}

/**
 * The retained tool receipts and user messages do not fit this model window.
 * Callers must keep the original history. This error does not delete execution evidence.
 */
export class ContextAdmissionError extends Error {
  readonly usage: ContextTokenUsage

  constructor(usage: ContextTokenUsage) {
    super(`Retained tool receipts and user messages need ${usage.inputTokens} input tokens. The context window has ${usage.contextWindowTokens} tokens. The request was refused. Execution receipts were not removed. The count source is ${usage.source}.`)
    this.name = 'ContextAdmissionError'
    this.usage = usage
  }
}

const IMAGE_TOKEN_ALLOWANCE = 1600
const NEAR_THRESHOLD_FRACTION = 0.8

const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u

function isInlineImageDataUrl(value: string) {
  return value.slice(0, 11).toLowerCase() === 'data:image/' && value.includes(';base64,')
}

function estimateTextTokens(text: string) {
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (CJK.test(char))
      cjk += 1
    else if (!/\s/u.test(char))
      other += 1
  }
  return cjk + Math.ceil(other / 4)
}

interface EstimateParts {
  textTokens: number
  images: number
}

function addEstimate(value: unknown, parts: EstimateParts) {
  if (typeof value === 'string') {
    if (isInlineImageDataUrl(value))
      parts.images += 1
    else
      parts.textTokens += estimateTextTokens(value)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    parts.textTokens += estimateTextTokens(String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value)
      addEstimate(item, parts)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      parts.textTokens += estimateTextTokens(key)
      addEstimate(child, parts)
    }
  }
}

function usageFrom(identity: ContextTokenIdentity, inputTokens: number, source: ContextTokenSource): ContextTokenUsage {
  return {
    inputTokens,
    outputReserveTokens: identity.outputReserveTokens,
    contextWindowTokens: identity.contextWindowTokens ?? 0,
    source,
    model: identity.model,
    providerId: identity.providerId,
  }
}

/**
 * Estimates input tokens for one projected request.
 * CJK characters count as one token. Other visible characters count as one token per four characters.
 * Each inline image adds a fixed allowance. The source is always `estimated`.
 *
 * @example
 * estimateContextTokenUsage('你好', { model: 'm', providerId: 'p', outputReserveTokens: 0 })
 * // => inputTokens 2, source 'estimated'
 */
export function estimateContextTokenUsage(payload: unknown, identity: ContextTokenIdentity): ContextTokenUsage {
  try {
    const parts: EstimateParts = { textTokens: 0, images: 0 }
    addEstimate(payload, parts)
    return usageFrom(identity, parts.textTokens + (parts.images * IMAGE_TOKEN_ALLOWANCE), 'estimated')
  }
  catch {
    return usageFrom(identity, 0, 'unavailable')
  }
}

function cacheKey(identity: ContextTokenIdentity, capability: string, payload: unknown) {
  let hash = 0xCBF29CE484222325n
  const prime = 0x100000001B3n
  const text = `${identity.providerId}\0${identity.model}\0${capability}\0${JSON.stringify(payload)}`
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index))
    hash = (hash * prime) & 0xFFFFFFFFFFFFFFFFn
  }
  return hash.toString(16)
}

function nearThreshold(estimate: ContextTokenUsage, budget?: Pick<ContextTokenBudget, 'inputBudgetTokens'>) {
  const inputBudgetTokens = budget?.inputBudgetTokens
  if (inputBudgetTokens === undefined)
    return false
  if (inputBudgetTokens === 0)
    return estimate.inputTokens > 0
  return estimate.inputTokens >= Math.floor(inputBudgetTokens * NEAR_THRESHOLD_FRACTION)
}

function finiteTokenCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * Measures one projected provider request.
 * A local estimate runs first. A provider counter runs only near the Compact threshold.
 * A cached provider count is reused only for the same payload, model, provider, and capability.
 * Counter failures keep the estimate so Compact still runs.
 */
export async function measureRequestTokenUsage(input: {
  payload: unknown
  identity: ContextTokenIdentity
  budget?: Pick<ContextTokenBudget, 'inputBudgetTokens'>
  counter?: ContextTokenCounter
  localTokenizer?: LocalTokenTokenizer
  cache?: ContextTokenCountCache
  signal?: AbortSignal
}): Promise<ContextTokenUsage> {
  const estimate = estimateContextTokenUsage(input.payload, input.identity)
  if (estimate.source === 'unavailable')
    return estimate

  let key: string | undefined
  if (input.counter) {
    try {
      key = cacheKey(input.identity, input.counter.capability, input.payload)
    }
    catch {
      key = undefined
    }
  }
  const cached = key ? input.cache?.read(key) : undefined
  if (cached !== undefined && finiteTokenCount(cached))
    return usageFrom(input.identity, cached, 'provider-counted')

  if (input.counter && nearThreshold(estimate, input.budget)) {
    try {
      const counted = await input.counter.countInputTokens(input.payload, input.signal)
      if (finiteTokenCount(counted)) {
        if (key)
          input.cache?.write(key, counted)
        return usageFrom(input.identity, counted, 'provider-counted')
      }
    }
    catch (error) {
      // A cancelled request must stop. A failed count keeps the estimate.
      if (input.signal?.aborted)
        throw error
    }
  }

  if (input.localTokenizer) {
    try {
      const counted = input.localTokenizer.countTokens(input.payload)
      if (finiteTokenCount(counted))
        return usageFrom(input.identity, counted, 'local-tokenizer')
    }
    catch {
      // A broken local tokenizer must not block the estimate.
    }
  }

  return estimate
}

/**
 * Refuses a request whose retained floor cannot fit the model window.
 * An estimate must exceed the full window. A counted value must exceed the window minus the output reserve.
 * `unavailable` does not refuse the request.
 */
export function assertRetainedContextFits(usage: ContextTokenUsage) {
  if (usage.source === 'unavailable' || usage.contextWindowTokens <= 0)
    return

  const limit = usage.source === 'estimated'
    ? usage.contextWindowTokens
    : Math.max(0, usage.contextWindowTokens - usage.outputReserveTokens)
  if (usage.inputTokens > limit)
    throw new ContextAdmissionError(usage)
}

/** Keeps a small exact-payload cache. Older keys leave first. */
export function createContextTokenCountCache(limit = 32): ContextTokenCountCache {
  const entries = new Map<string, number>()
  return {
    read(key) {
      const value = entries.get(key)
      if (value === undefined)
        return undefined
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    write(key, inputTokens) {
      entries.delete(key)
      entries.set(key, inputTokens)
      while (entries.size > limit) {
        const oldest = entries.keys().next().value
        if (oldest === undefined)
          break
        entries.delete(oldest)
      }
    },
  }
}
