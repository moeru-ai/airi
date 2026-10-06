import type { Database } from '../../libs/db'
import type { PushedField } from './field-sync'

import { characterCardTables } from '../../schemas/character-cards'
import { createBadRequestError } from '../../utils/error'
import { createFieldSyncStore } from './field-sync'

/**
 * The client splits a card with RFC 6901 JSON Pointers, so every key starts with `/`.
 * The store keeps any key, so this check stops a client that writes other data here.
 */
function assertCardFieldKeys(fields: PushedField[]) {
  const invalid = fields.filter(field => !field.key.startsWith('/')).map(field => field.key)
  if (invalid.length > 0)
    throw createBadRequestError('A card field key must be a JSON Pointer', 'INVALID_REQUEST', invalid)
}

/** Stores the character cards that a user synchronizes between devices. */
export function createCharacterCardService(db: Database) {
  return createFieldSyncStore(db, characterCardTables, { validate: assertCardFieldKeys })
}

export type CharacterCardService = ReturnType<typeof createCharacterCardService>
