import type { ContextSourceRef } from '@proj-airi/plugin-protocol/types'

import { Tiktoken } from 'js-tiktoken/lite'

/** The default admission limit keeps each observation small enough for repeated model requests. */
export const CONTEXT_ENTRY_TOKEN_LIMIT = 80

/** Counts pool text, not provider billing. Literal tokenizer control markers remain ordinary text. */
export type ContextTokenCounter = (text: string) => number

// Registries and producers share one local encoder per process.
let poolTokenCounter: Promise<ContextTokenCounter> | undefined

/**
 * Loads the local o200k_base encoder once.
 * The rank table is a separate chunk, so a host without observations never downloads it.
 */
export function loadContextTokenCounter(): Promise<ContextTokenCounter> {
  poolTokenCounter ??= import('js-tiktoken/ranks/o200k_base').then(({ default: ranks }) => {
    const encoder = new Tiktoken(ranks)
    return (text: string) => encoder.encode(text, [], []).length
  })
  return poolTokenCounter
}

/**
 * Replaces oversized text with its origin handle. The producer retains the original details.
 * An oversized handle fails rather than becoming an unusable reference in the pool.
 */
export async function createContextText(text: string, sourceRef: ContextSourceRef): Promise<{ text: string, sourceRef: ContextSourceRef }> {
  const countTokens = await loadContextTokenCounter()
  const reference = { ...sourceRef }
  if (countTokens(text) <= CONTEXT_ENTRY_TOKEN_LIMIT)
    return { text, sourceRef: reference }

  const referenceText = `Source details: ${reference.refType}/${reference.targetId}`
  if (countTokens(referenceText) > CONTEXT_ENTRY_TOKEN_LIMIT)
    throw new RangeError('Context source reference exceeds the observation budget')
  return { text: referenceText, sourceRef: reference }
}
