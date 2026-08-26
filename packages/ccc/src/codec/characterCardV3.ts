import type { InferOutput } from 'valibot'

import {
  array,
  boolean,
  literal,
  number,
  objectWithRest,
  optional,
  picklist,
  pipe,
  record,
  regex,
  safeParse,
  string,
  union,
  unknown,
} from 'valibot'

const currentSpecVersion = 3
const invalidCharacterCardMessage = 'Invalid Character Card V3.'

const extensionsDepthPromptSchema = objectWithRest({
  depth: number(),
  prompt: string(),
  role: string(),
}, unknown())

const extensionsSchema = objectWithRest({
  depth_prompt: optional(extensionsDepthPromptSchema),
  fav: optional(boolean()),
  talkativeness: optional(number()),
  world: optional(string()),
}, unknown())

const openExtensionsSchema = objectWithRest({}, unknown())

const assetSchema = objectWithRest({
  ext: string(),
  name: string(),
  type: string(),
  uri: string(),
}, unknown())

const characterBookEntrySchema = objectWithRest({
  case_sensitive: optional(boolean()),
  comment: optional(string()),
  constant: optional(boolean()),
  content: string(),
  enabled: boolean(),
  extensions: openExtensionsSchema,
  id: optional(union([number(), string()])),
  insertion_order: number(),
  keys: array(string()),
  name: optional(string()),
  position: optional(picklist(['before_char', 'after_char'])),
  priority: optional(number()),
  secondary_keys: optional(array(string())),
  selective: optional(boolean()),
  use_regex: boolean(),
}, unknown())

const characterBookSchema = objectWithRest({
  description: optional(string()),
  entries: array(characterBookEntrySchema),
  extensions: openExtensionsSchema,
  name: optional(string()),
  recursive_scanning: optional(boolean()),
  scan_depth: optional(number()),
  token_budget: optional(number()),
}, unknown())

const characterCardDataSchema = objectWithRest({
  alternate_greetings: array(string()),
  assets: optional(array(assetSchema)),
  character_book: optional(characterBookSchema),
  character_version: string(),
  creation_date: optional(number()),
  creator: string(),
  creator_notes: string(),
  creator_notes_multilingual: optional(record(string(), string())),
  description: string(),
  extensions: extensionsSchema,
  first_mes: string(),
  group_only_greetings: array(string()),
  mes_example: string(),
  modification_date: optional(number()),
  name: string(),
  nickname: optional(string()),
  personality: string(),
  post_history_instructions: string(),
  scenario: string(),
  source: optional(array(string())),
  system_prompt: string(),
  tags: array(string()),
}, unknown())

const characterCardV3Schema = objectWithRest({
  data: characterCardDataSchema,
  spec: literal('chara_card_v3'),
  spec_version: pipe(string(), regex(/^\d+(?:\.\d+)*$/)),
}, unknown())

/** One asset reference declared by a CCv3 document. */
export type Asset = InferOutput<typeof assetSchema>
/** Asset references declared by a CCv3 document. */
export type Assets = Asset[]
/** Character-specific Lorebook data. */
export type CharacterBook = InferOutput<typeof characterBookSchema>
/** One independently matched and ordered Lorebook entry. */
export type CharacterBookEntry = InferOutput<typeof characterBookEntrySchema>
/** Application-defined Lorebook entry metadata. */
export type CharacterBookEntryExtensions = InferOutput<typeof openExtensionsSchema>
/** Application-defined Lorebook metadata. */
export type CharacterBookExtensions = InferOutput<typeof openExtensionsSchema>
/** Compatibility of a parsed document relative to AIRI's current CCv3 implementation. */
export type CharacterCardCompatibility = 'current' | 'newer' | 'older'
/** A Character Card document using the CCv3 envelope and data contract. */
export type CharacterCardV3 = InferOutput<typeof characterCardV3Schema>
/** Complete data object carried by a CCv3 envelope. */
export type Data = InferOutput<typeof characterCardDataSchema>
/** Fields inherited from Character Card V1. */
export type DataV1 = Pick<Data, 'description' | 'first_mes' | 'mes_example' | 'name' | 'personality' | 'scenario'>
/** Fields inherited from Character Card V2. */
export type DataV2 = Pick<Data, 'alternate_greetings' | 'character_book' | 'character_version' | 'creator' | 'creator_notes' | 'extensions' | 'post_history_instructions' | 'system_prompt' | 'tags'>
/** Fields introduced or changed by Character Card V3. */
export type DataV3 = Pick<Data, 'assets' | 'creation_date' | 'creator_notes_multilingual' | 'group_only_greetings' | 'modification_date' | 'nickname' | 'source'>
/** Community extension fields carried by a character card. */
export type Extensions = InferOutput<typeof extensionsSchema>

/** Standard `depth_prompt` extension value. */
export type ExtensionsDepthPrompt = InferOutput<typeof extensionsDepthPromptSchema>

/** Options retained on a CCv3 validation failure. */
export interface InvalidCharacterCardErrorOptions {
  /** Parser or schema issues that made the source unusable. */
  cause?: unknown
  /** Original JSON text or object supplied by the caller. */
  source: unknown
}

/** A validated CCv3 document together with its compatibility classification. */
export interface ParsedCharacterCardV3 {
  /** Validated card data. Unknown future fields remain attached to their owning objects. */
  card: CharacterCardV3
  /** Whether the source version is older than, equal to, or newer than CCv3 3.0. */
  compatibility: CharacterCardCompatibility
}

/** Error thrown when input cannot be interpreted as a Character Card V3 document. */
export class InvalidCharacterCardError extends Error {
  readonly source: unknown

  constructor(options: InvalidCharacterCardErrorOptions) {
    super(invalidCharacterCardMessage, { cause: options.cause })
    this.name = 'InvalidCharacterCardError'
    this.source = options.source
  }
}

/** Checks whether an error came from the CCv3 parsing boundary. */
export function isInvalidCharacterCardError(error: unknown): error is InvalidCharacterCardError {
  return error instanceof InvalidCharacterCardError
}

/**
 * Parses and validates a Character Card V3 object or JSON document.
 *
 * Unknown fields are preserved so a newer card can be inspected and exported
 * without silently discarding data AIRI does not understand yet. Older and
 * newer `spec_version` values are accepted and reported through
 * `compatibility`; callers can decide how prominently to warn users.
 */
export function parseCharacterCardV3(source: unknown): ParsedCharacterCardV3 {
  const candidate = parseJsonSource(source)
  const result = safeParse(characterCardV3Schema, candidate)

  if (!result.success) {
    throw new InvalidCharacterCardError({
      cause: result.issues,
      source,
    })
  }

  return {
    card: result.output,
    compatibility: resolveCompatibility(result.output.spec_version),
  }
}

function parseJsonSource(source: unknown): unknown {
  if (typeof source !== 'string')
    return source

  try {
    return JSON.parse(source)
  }
  catch (cause) {
    throw new InvalidCharacterCardError({ cause, source })
  }
}

function resolveCompatibility(specVersion: string): CharacterCardCompatibility {
  const sourceVersion = Number.parseFloat(specVersion)
  if (sourceVersion < currentSpecVersion)
    return 'older'
  if (sourceVersion > currentSpecVersion)
    return 'newer'
  return 'current'
}
