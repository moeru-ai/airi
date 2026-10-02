import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** One dispatch observed by AIRI, not retries hidden inside a gateway. */
export const llmRequestAttempt = pgTable('llm_request_attempt', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  requestId: text('request_id').notNull(),
  sequence: integer('sequence').notNull(),
  gateway: text('gateway').notNull(),
  routeId: text('route_id'),
  credentialId: text('credential_id').notNull(),
  model: text('model').notNull(),
  upstreamProvider: text('upstream_provider'),
  responseModel: text('response_model'),
  generationId: text('generation_id'),
  state: text('state').notNull(),
  status: integer('status'),
  errorCode: text('error_code'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  timeToFirstTokenMs: integer('time_to_first_token_ms'),
  providerUsage: jsonb('provider_usage'),
  providerMetadata: jsonb('provider_metadata'),
  schemaVersion: integer('schema_version').notNull().default(1),
}, table => [
  uniqueIndex('llm_attempt_request_sequence_uidx').on(table.userId, table.requestId, table.sequence),
  index('llm_attempt_gateway_generation_idx').on(table.gateway, table.generationId),
  index('llm_attempt_state_started_idx').on(table.state, table.startedAt),
])
