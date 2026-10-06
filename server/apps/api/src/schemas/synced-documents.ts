import type { InferSelectModel } from 'drizzle-orm'

import { foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One row for each document that a user synchronizes between devices.
 *
 * A collection groups the documents of one client feature, for example
 * `character-cards`. The row stays after deletion. `deletedAt` tells other
 * devices to remove the document, and `revision` continues to increase if a
 * device restores it.
 */
export const syncedDocuments = pgTable(
  'synced_documents',
  {
    ownerId: text('owner_id').notNull(),
    collection: text('collection').notNull(),
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
    primaryKey({ columns: [table.ownerId, table.collection, table.documentId] }),
  ],
)

/**
 * One row for each independent part of a document.
 *
 * The client selects the parts and encodes each location in `key`. The server
 * does not read `value`. A missing row means that the document does not have the part.
 */
export const syncedDocumentFields = pgTable(
  'synced_document_fields',
  {
    ownerId: text('owner_id').notNull(),
    collection: text('collection').notNull(),
    documentId: text('document_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull().$type<unknown>(),
    revision: integer('revision').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.ownerId, table.collection, table.documentId, table.key] }),
    foreignKey({
      // The generated name exceeds the 63-character limit of PostgreSQL identifiers.
      name: 'synced_document_fields_document_fk',
      columns: [table.ownerId, table.collection, table.documentId],
      foreignColumns: [syncedDocuments.ownerId, syncedDocuments.collection, syncedDocuments.documentId],
    }).onDelete('cascade'),
  ],
)

export type SyncedDocument = InferSelectModel<typeof syncedDocuments>
export type SyncedDocumentField = InferSelectModel<typeof syncedDocumentFields>
