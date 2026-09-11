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

export type AiriCardDraftValidationError = 'name' | 'version' | 'invalid_artistry_json'

/** Module settings owned by the AIRI Card editor form. */
interface AiriCardEditorModules {
  consciousness: AiriExtension['modules']['consciousness']
  vision: AiriExtension['modules']['vision']
  speech: Pick<AiriExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>
  displayModelId?: string
  artistry: Pick<
    NonNullable<AiriExtension['modules']['artistry']>,
    | 'provider'
    | 'model'
    | 'promptPrefix'
    | 'widgetInstruction'
    | 'spawnMode'
    | 'options'
    | 'autonomousEnabled'
    | 'autonomousThreshold'
  >
}

/**
 * Reads the module fields that the AIRI Card editor owns.
 *
 * Empty strings mean that the card inherits the corresponding global setting.
 */
export function getAiriCardEditorModuleSettings(
  card: Card | undefined,
): Pick<AiriCardEditorModules, 'consciousness' | 'vision' | 'speech' | 'displayModelId'> {
  const modules = getAiriCardModules(card?.extensions?.airi)

  return {
    consciousness: {
      provider: getModuleString(modules?.consciousness, 'provider'),
      model: getModuleString(modules?.consciousness, 'model'),
    },
    vision: {
      provider: getModuleString(modules?.vision, 'provider'),
      model: getModuleString(modules?.vision, 'model'),
    },
    speech: {
      provider: getModuleString(modules?.speech, 'provider'),
      model: getModuleString(modules?.speech, 'model'),
      voice_id: getModuleString(modules?.speech, 'voice_id'),
    },
    displayModelId: getModuleString(modules, 'displayModelId'),
  }
}

type CardWithAiriExtension = Card & {
  extensions: NonNullable<Card['extensions']> & {
    airi: AiriExtension
  }
}

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
        modules: {
          ...existing?.modules,
          ...edited,
          speech: {
            ...existing?.modules.speech,
            ...edited.speech,
          },
          artistry: {
            ...existing?.modules.artistry,
            ...edited.artistry,
          },
        },
        agents: existing?.agents ?? {},
      },
    },
  }
}

function isAiriExtension(value: unknown): value is AiriExtension {
  return isRecord(value)
    && isRecord(value.modules)
    && isRecord(value.agents)
}

function getAiriCardModules(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.modules))
    return undefined

  return value.modules
}

function getModuleString(module: unknown, key: string): string {
  if (!isRecord(module))
    return ''

  const value = module[key]
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
