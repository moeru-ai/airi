import { foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * The character cards that a user synchronizes between devices.
 *
 * The tables follow the contract of `createFieldSyncStore`. The row of a
 * deleted card stays, and `revision` continues to increase if a device
 * restores the card.
 *
 * `character_cards_fields` only appends rows, so the table keeps the history
 * of a card. `character-cards-cleanup.ts` deletes old rows on a schedule.
 */
export const characterCards = pgTable(
  'character_cards',
  {
    ownerId: text('owner_id').notNull(),
    /** The client mints this id, and chat members refer to the same id. */
    documentId: text('document_id').notNull(),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    primaryKey({ name: 'character_cards_pk', columns: [table.ownerId, table.documentId] }),
  ],
)

/**
 * One row for each change to a part of a card. The key is a JSON Pointer
 * into the card. A `null` value means that the revision removed the part.
 */
export const characterCardFields = pgTable(
  'character_cards_fields',
  {
    ownerId: text('owner_id').notNull(),
    documentId: text('document_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>(),
    revision: integer('revision').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ name: 'character_cards_fields_pk', columns: [table.ownerId, table.documentId, table.key, table.revision] }),
    foreignKey({
      // The generated name exceeds the 63-character limit of PostgreSQL identifiers.
      name: 'character_cards_fields_document_fk',
      columns: [table.ownerId, table.documentId],
      foreignColumns: [characterCards.ownerId, characterCards.documentId],
    }).onDelete('cascade'),
  ],
)
