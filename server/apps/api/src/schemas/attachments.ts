import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export type AttachmentState = 'pending' | 'ready'

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    state: text('state').notNull().$type<AttachmentState>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('attachments_object_key_uidx').on(table.objectKey),
    index('attachments_owner_id_created_at_idx').on(table.ownerId, table.createdAt),
  ],
)

export type Attachment = InferSelectModel<typeof attachments>
export type NewAttachment = InferInsertModel<typeof attachments>
