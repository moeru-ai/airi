import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Durable billing evidence survives deletion of diagnostic requests and attempts. */
export const llmRequestSettlement = pgTable('llm_request_settlement', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  requestId: text('request_id').notNull(),
  attemptId: text('attempt_id'),
  model: text('model').notNull(),
  method: text('method').notNull(),
  billingProvider: text('billing_provider'),
  billingStatus: text('billing_status').notNull(),
  pendingReason: text('pending_reason'),
  generationId: text('generation_id'),
  pricing: jsonb('pricing'),
  evidence: jsonb('evidence'),
  providerUsage: jsonb('provider_usage'),
  costUsd: text('cost_usd'),
  microFlux: bigint('micro_flux', { mode: 'number' }),
  requestedFlux: bigint('requested_flux', { mode: 'number' }),
  fluxConsumed: bigint('flux_consumed', { mode: 'number' }),
  remainderBefore: bigint('remainder_before', { mode: 'number' }),
  remainderAfter: bigint('remainder_after', { mode: 'number' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  settledAt: timestamp('settled_at'),
}, table => [
  uniqueIndex('llm_settlement_user_request_uidx').on(table.userId, table.requestId),
  index('llm_settlement_status_created_idx').on(table.billingStatus, table.createdAt),
])
