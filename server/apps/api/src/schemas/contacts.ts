import type { CharacterDocument } from '@proj-airi/server-sdk-shared/contacts'

import { integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { character } from './characters'

/** Account-owned character relationships. Deleted identities remain as sync tombstones. */
export const contacts = pgTable('contacts', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  ownerId: text('owner_id').notNull(),
  characterId: text('character_id').notNull().references(() => character.id),
  localCharacterId: text('local_character_id'),
  lastMutationId: text('last_mutation_id'),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  unique('contacts_owner_character_unique').on(table.ownerId, table.characterId),
  unique('contacts_owner_id_unique').on(table.ownerId, table.id),
  unique('contacts_owner_local_character_unique').on(table.ownerId, table.localCharacterId),
])

/** Private portable definitions are readable only through the account-owned contact API. */
export const characterDocuments = pgTable('character_documents', {
  characterId: text('character_id').primaryKey().references(() => character.id),
  document: jsonb('document').$type<CharacterDocument>().notNull(),
})
