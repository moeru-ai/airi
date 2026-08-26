import type { Card } from '@proj-airi/ccc'

import type { AiriExtension } from '../types/airiCard'

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

export type AiriCardDraftValidationError = 'invalid_artistry_json' | 'name' | 'version'

export type AiriCardDraftValidationResult
  = | {
    error: AiriCardDraftValidationError
    success: false
  }
  | {
    output: {
      artistryOptions: Record<string, unknown> | undefined
      card: Card
    }
    success: true
  }

/** Module settings owned by the AIRI Card editor form. */
interface AiriCardEditorModules {
  artistry: Pick<
    NonNullable<AiriExtension['modules']['artistry']>,
    | 'autonomousEnabled'
    | 'autonomousThreshold'
    | 'model'
    | 'options'
    | 'promptPrefix'
    | 'provider'
    | 'spawnMode'
    | 'widgetInstruction'
  >
  consciousness: AiriExtension['modules']['consciousness']
  displayModelId?: string
  speech: Pick<AiriExtension['modules']['speech'], 'model' | 'provider' | 'voice_id'>
  vision: AiriExtension['modules']['vision']
}

type CardWithAiriExtension = Card & {
  extensions: NonNullable<Card['extensions']> & {
    airi: AiriExtension
  }
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
 * Applies editor-owned module fields to a complete character card.
 *
 * The returned card preserves extension fields the form cannot display,
 * including body models, backgrounds, advanced speech/artistry settings, and
 * agent configuration.
 */
export function applyAiriCardEditorModules(
  card: Card,
  edited: AiriCardEditorModules,
): CardWithAiriExtension {
  const existing = isAiriExtension(card.extensions?.airi)
    ? card.extensions.airi
    : undefined

  return {
    ...card,
    extensions: {
      ...card.extensions,
      airi: {
        ...existing,
        agents: existing?.agents ?? {},
        modules: {
          ...existing?.modules,
          ...edited,
          artistry: {
            ...existing?.modules.artistry,
            ...edited.artistry,
          },
          speech: {
            ...existing?.modules.speech,
            ...edited.speech,
          },
        },
      },
    },
  }
}

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
      error: invalidField === 'version' ? 'version' : 'name',
      success: false,
    }
  }

  const normalizedArtistryOptions = artistryOptionsJson.trim()
  if (!normalizedArtistryOptions) {
    return {
      output: {
        artistryOptions: undefined,
        card: { ...card, ...cardResult.output },
      },
      success: true,
    }
  }

  const artistryResult = safeParse(artistryOptionsSchema, normalizedArtistryOptions)
  if (!artistryResult.success) {
    return {
      error: 'invalid_artistry_json',
      success: false,
    }
  }

  return {
    output: {
      artistryOptions: artistryResult.output,
      card: { ...card, ...cardResult.output },
    },
    success: true,
  }
}

function isAiriExtension(value: unknown): value is AiriExtension {
  return isRecord(value)
    && isRecord(value.modules)
    && isRecord(value.agents)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
