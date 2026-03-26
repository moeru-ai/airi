import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export const outboxEvents = pgTable('outbox_events', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  userId: text('user_id').notNull(),
  requestId: text('request_id'),
  schemaVersion: integer('schema_version').notNull(),
  payload: text('payload').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
  availableAt: timestamp('available_at').defaultNow().notNull(),
  claimedBy: text('claimed_by'),
  claimExpiresAt: timestamp('claim_expires_at'),
  publishedAt: timestamp('published_at'),
  streamMessageId: text('stream_message_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('outbox_events_event_id_idx').on(table.eventId),
  index('outbox_events_publish_scan_idx').on(table.publishedAt, table.availableAt, table.claimExpiresAt, table.createdAt),
  index('outbox_events_claimed_by_idx').on(table.claimedBy),
])

export type OutboxEvent = InferSelectModel<typeof outboxEvents>
export type NewOutboxEvent = InferInsertModel<typeof outboxEvents>
