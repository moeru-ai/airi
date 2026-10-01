import type { ContextSourceRef } from '@proj-airi/plugin-protocol/types'

import o200kBase from 'js-tiktoken/ranks/o200k_base'

import { Tiktoken } from 'js-tiktoken/lite'

/** The default admission limit keeps each observation small enough for repeated model requests. */
export const CONTEXT_ENTRY_TOKEN_LIMIT = 80

// Registries and producers share one local encoder per process, initialized on the first observation.
let poolTokenizer: Tiktoken | undefined

/** Counts pool text, not provider billing. Literal tokenizer control markers remain ordinary text. */
export function countContextTokens(text: string): number {
  poolTokenizer ??= new Tiktoken(o200kBase)
  return poolTokenizer.encode(text, [], []).length
}

/**
 * Replaces oversized text with its origin handle. The producer retains the original details.
 * An oversized handle fails rather than becoming an unusable reference in the pool.
 */
export function createContextText(text: string, sourceRef: ContextSourceRef): { text: string, sourceRef: ContextSourceRef } {
  const reference = { ...sourceRef }
  if (countContextTokens(text) <= CONTEXT_ENTRY_TOKEN_LIMIT)
    return { text, sourceRef: reference }

  const referenceText = `Source details: ${reference.refType}/${reference.targetId}`
  if (countContextTokens(referenceText) > CONTEXT_ENTRY_TOKEN_LIMIT)
    throw new RangeError('Context source reference exceeds the observation budget')
  return { text: referenceText, sourceRef: reference }
}
