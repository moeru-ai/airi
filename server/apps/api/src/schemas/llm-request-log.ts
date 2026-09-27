import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Request summaries are diagnostic facts, not settlement evidence. */
export const llmRequestLog = pgTable('llm_request_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(), // NOTICE: do NOT use foreign key constraint here to avoid potential performance issues on high-concurrency writes
  model: text('model').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  fluxConsumed: bigint('flux_consumed', { mode: 'number' }).notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  cachedTokens: integer('cached_tokens'),
  cacheWriteTokens: integer('cache_write_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  requestId: text('request_id'),
  sessionId: text('session_id'),
  protocol: text('protocol'),
  stream: boolean('stream'),
  requestedModel: text('requested_model'),
  gateway: text('gateway'),
  upstreamModel: text('upstream_model'),
  upstreamProvider: text('upstream_provider'),
  responseModel: text('response_model'),
  generationId: text('generation_id'),
  finishReason: text('finish_reason'),
  nativeFinishReason: text('native_finish_reason'),
  responseStatus: text('response_status'),
  timeToFirstTokenMs: integer('time_to_first_token_ms'),
  routing: jsonb('routing'),
  providerUsage: jsonb('provider_usage'),
  providerMetadata: jsonb('provider_metadata'),
  attemptId: text('attempt_id'),
  interactionId: text('interaction_id'),
  state: text('state'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  dimensions: jsonb('dimensions'),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('llm_request_log_user_request_uidx').on(table.userId, table.requestId).where(sql`request_id IS NOT NULL`),
  index('llm_request_log_state_started_idx').on(table.state, table.startedAt),
  index('llm_request_log_gateway_generation_idx').on(table.gateway, table.generationId),
  index('llm_request_log_user_created_idx').on(table.userId, table.createdAt),
])
