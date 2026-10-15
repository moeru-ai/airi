import type { InferSelectModel } from 'drizzle-orm'

import { bigint, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/** Private account directory of imported display models. Bytes live in object storage. */
export const displayModels = pgTable(
  'display_models',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    format: text('format', { enum: ['live2d-zip', 'vrm'] }).notNull(),
    name: text('name').notNull(),
    originalFilename: text('original_filename').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    // Null until an upload completes and passes verification.
    objectKey: text('object_key'),
    status: text('status', { enum: ['pending', 'ready'] }).notNull().default('pending'),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    primaryKey({ name: 'display_models_pk', columns: [table.ownerId, table.id] }),
  ],
)

export type DisplayModelRow = InferSelectModel<typeof displayModels>
