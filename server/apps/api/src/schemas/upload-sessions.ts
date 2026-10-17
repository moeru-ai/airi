import type { InferSelectModel } from 'drizzle-orm'

import { bigint, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/**
 * One reserved direct upload. Generic across business purposes.
 * The owner and purpose are decided by the server. The client never sets `objectKey`.
 */
export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerId: text('owner_id').notNull(),
    purpose: text('purpose').notNull(),
    // The business record that the upload belongs to, for example a display model id.
    subjectId: text('subject_id').notNull(),
    requestId: text('request_id').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    expectedSize: bigint('expected_size', { mode: 'number' }).notNull(),
    expectedSha256: text('expected_sha256').notNull(),
    status: text('status', { enum: ['pending', 'completed', 'aborted'] }).notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => [
    uniqueIndex('upload_sessions_owner_purpose_request_unique').on(table.ownerId, table.purpose, table.requestId),
    index('upload_sessions_owner_status_idx').on(table.ownerId, table.status),
  ],
)

export type UploadSession = InferSelectModel<typeof uploadSessions>
