import type { Card } from '@proj-airi/ccc'

import {
  check,
  nonEmpty,
  object,
  objectWithRest,
  parseJson,
  pipe,
  regex,
  safeParse,
  string,
  trim,
  unknown,
} from 'valibot'

export type AiriCardDraftValidationError = 'name' | 'version' | 'invalid_artistry_json'

export type AiriCardDraftValidationResult
  = | {
    success: true
    output: {
      card: Card
      artistryOptions: Record<string, unknown> | undefined
    }
  }
  | {
    success: false
    error: AiriCardDraftValidationError
  }

const cardDraftSchema = object({
  name: pipe(string(), trim(), nonEmpty()),
  version: pipe(string(), trim(), regex(/^(?:\d+\.)+\d+$/)),
})

const artistryOptionsSchema = pipe(
  string(),
  trim(),
  parseJson(),
  check(isRecord),
  objectWithRest({}, unknown()),
)

/**
 * Validates and normalizes the fields owned by the AIRI Card editor.
 *
 * Display text remains untouched except for boundary whitespace on the
 * required name and version fields. Artistry options must be a JSON object
 * when present.
 */
export function safeParseAiriCardDraft(card: Card, artistryOptionsJson: string): AiriCardDraftValidationResult {
  const cardResult = safeParse(cardDraftSchema, card)
  if (!cardResult.success) {
    const invalidField = cardResult.issues[0]?.path?.[0]?.key
    return {
      success: false,
      error: invalidField === 'version' ? 'version' : 'name',
    }
  }

  const normalizedArtistryOptions = artistryOptionsJson.trim()
  if (!normalizedArtistryOptions) {
    return {
      success: true,
      output: {
        card: { ...card, ...cardResult.output },
        artistryOptions: undefined,
      },
    }
  }

  const artistryResult = safeParse(artistryOptionsSchema, normalizedArtistryOptions)
  if (!artistryResult.success) {
    return {
      success: false,
      error: 'invalid_artistry_json',
    }
  }

  return {
    success: true,
    output: {
      card: { ...card, ...cardResult.output },
      artistryOptions: artistryResult.output,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
