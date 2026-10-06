import type { Database } from '../../libs/db'
import type { PushedField } from './field-sync'

import * as v from 'valibot'

import { characterCardFields, characterCards } from '../../schemas/character-cards'
import { createBadRequestError } from '../../utils/error'
import { createFieldSyncStore } from './field-sync'

/**
 * RFC 6901 JSON Pointer with at least one segment. A `~` must start the escape
 * `~0` or `~1`. The client decodes a key and encodes it again, so a key with
 * another escape would come back as a different key.
 */
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)+$/

const textSchema = v.string()
const textListSchema = v.array(v.string())
// A record schema accepts an array, because an array is an object with string keys.
const recordSchema = v.record(v.string(), v.unknown())
const objectSchema = v.pipe(v.unknown(), v.check(value => !Array.isArray(value) && v.is(recordSchema, value), 'Expected an object'))

/**
 * The shapes of the fields that the client reads without a further check.
 * A value of another shape makes the card fail on every other device. A key
 * that is not in this table accepts any JSON, because cards from other
 * applications carry their own extensions.
 */
const knownFieldSchemas: Record<string, v.GenericSchema> = {
  '/name': textSchema,
  '/version': textSchema,
  '/description': textSchema,
  '/personality': textSchema,
  '/scenario': textSchema,
  '/systemPrompt': textSchema,
  '/postHistoryInstructions': textSchema,
  '/tags': textListSchema,
  '/greetings': textListSchema,
  '/greetingsGroupOnly': textListSchema,
  '/messageExample': v.array(v.array(v.unknown())),
  '/extensions/airi/agents': objectSchema,
  '/extensions/airi/wakeWords': v.array(v.unknown()),
  '/extensions/airi/modules/consciousness': objectSchema,
  '/extensions/airi/modules/vision': objectSchema,
  '/extensions/airi/modules/speech': objectSchema,
  '/extensions/airi/modules/artistry': objectSchema,
  '/extensions/airi/modules/vrm': objectSchema,
  '/extensions/airi/modules/live2d': objectSchema,
  '/extensions/airi/modules/displayModelId': textSchema,
  '/extensions/airi/modules/activeBackgroundId': textSchema,
}

function assertCardFields(fields: PushedField[]) {
  const invalid: string[] = []

  for (const field of fields) {
    if (!JSON_POINTER_PATTERN.test(field.key)) {
      invalid.push(field.key)
      continue
    }
    if ('removed' in field)
      continue

    const schema = knownFieldSchemas[field.key]
    if (schema && !v.safeParse(schema, field.value).success)
      invalid.push(field.key)
  }

  if (invalid.length > 0)
    throw createBadRequestError('Invalid card field', 'INVALID_REQUEST', invalid)
}

/** Stores the character cards that a user synchronizes between devices. */
export function createCharacterCardService(db: Database) {
  return createFieldSyncStore(db, { documents: characterCards, fields: characterCardFields }, { validate: assertCardFields })
}

export type CharacterCardService = ReturnType<typeof createCharacterCardService>
