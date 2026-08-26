import { bigint, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export const llmRequestLog = pgTable('llm_request_log', {
  completionTokens: integer('completion_tokens'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  durationMs: integer('duration_ms').notNull(),
  fluxConsumed: bigint('flux_consumed', { mode: 'number' }).notNull(),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens'),
  status: integer('status').notNull(),
  userId: text('user_id').notNull(), // NOTICE: do NOT use foreign key constraint here to avoid potential performance issues on high-concurrency writes
})
