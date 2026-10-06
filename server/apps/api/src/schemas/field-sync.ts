import { foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Defines the two tables that one feature uses to store field-synchronized documents.
 *
 * Each feature calls this once, exports the result from its own schema file,
 * and passes it to `createFieldSyncStore`. The tables belong to the feature, so
 * the feature can add indexes, extra tables, and retention rules around them.
 *
 * A document is a set of independent fields. The row of a deleted document
 * stays. `deletedAt` tells other devices to remove the document, and
 * `revision` continues to increase if a device restores it.
 *
 * @param name The table name of the documents, for example `character_cards`. The fields table is `${name}_fields`.
 *
 * @example
 * export const characterCardTables = defineFieldSyncTables('character_cards')
 */
export function defineFieldSyncTables(name: string) {
  const documents = pgTable(
    name,
    {
      ownerId: text('owner_id').notNull(),
      /** The client mints this id, so other data of the client can refer to it. */
      documentId: text('document_id').notNull(),
      /**
       * Counts the accepted writes to this document. Each field row stores the
       * value that this counter had when the field last changed.
       */
      revision: integer('revision').notNull().default(0),
      createdAt: timestamp('created_at').defaultNow().notNull(),
      updatedAt: timestamp('updated_at').defaultNow().notNull(),
      deletedAt: timestamp('deleted_at'),
    },
    table => [
      primaryKey({ name: `${name}_pk`, columns: [table.ownerId, table.documentId] }),
    ],
  )

  /**
   * The key encodes the location of a part in the document. The store does not
   * read `value`. A missing row means that the document does not have the part.
   */
  const fields = pgTable(
    `${name}_fields`,
    {
      ownerId: text('owner_id').notNull(),
      documentId: text('document_id').notNull(),
      key: text('key').notNull(),
      value: jsonb('value').notNull().$type<unknown>(),
      revision: integer('revision').notNull(),
      updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    table => [
      primaryKey({ name: `${name}_fields_pk`, columns: [table.ownerId, table.documentId, table.key] }),
      // The generated names exceed the 63-character limit of PostgreSQL identifiers.
      foreignKey({
        name: `${name}_fields_document_fk`,
        columns: [table.ownerId, table.documentId],
        foreignColumns: [documents.ownerId, documents.documentId],
      }).onDelete('cascade'),
    ],
  )

  return { documents, fields }
}

export type FieldSyncTables = ReturnType<typeof defineFieldSyncTables>
