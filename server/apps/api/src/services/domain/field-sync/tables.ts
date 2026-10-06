import { foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Describes the tables that `createFieldSyncStore` reads and writes. The
 * function only gives the compiler the column contract. Nothing calls it.
 * It is not a schema, so `drizzle-kit` does not read it.
 *
 * A feature declares its own tables in its own schema file. The tables need at
 * least these columns. The compiler rejects a table that misses one. A feature
 * can add columns and indexes. An added column must accept `null` or have a
 * default, because the store inserts a document row with only the two key columns.
 *
 * `name` has the type `string` on purpose, so the table name of a feature fits.
 */
function _describeTables(name: string) {
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
      /** The row of a deleted document stays, so other devices remove the document. */
      deletedAt: timestamp('deleted_at'),
    },
    table => [primaryKey({ columns: [table.ownerId, table.documentId] })],
  )

  const fields = pgTable(
    `${name}_fields`,
    {
      ownerId: text('owner_id').notNull(),
      documentId: text('document_id').notNull(),
      /** The client encodes the location of a part in the document. The store does not read it. */
      key: text('key').notNull(),
      /** The store does not read the value. A missing row means that the document does not have the part. */
      value: jsonb('value').notNull().$type<unknown>(),
      revision: integer('revision').notNull(),
      updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    table => [
      primaryKey({ columns: [table.ownerId, table.documentId, table.key] }),
      foreignKey({
        columns: [table.ownerId, table.documentId],
        foreignColumns: [documents.ownerId, documents.documentId],
      }).onDelete('cascade'),
    ],
  )

  return { documents, fields }
}

export type FieldSyncTables = ReturnType<typeof _describeTables>
