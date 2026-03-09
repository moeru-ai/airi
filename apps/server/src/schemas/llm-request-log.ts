import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const llmRequestLog = pgTable('llm_request_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  fluxConsumed: integer('flux_consumed').notNull(),
  // TODO: Add usage-based billing fields once billing model is finalized:
  //   promptTokens: integer('prompt_tokens'),
  //   completionTokens: integer('completion_tokens'),
  //   audioDurationMs: integer('audio_duration_ms'),  // for ASR billing
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
