import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE:
// Read-only archive. Nothing writes to this table after `flux_usage` replaced it.
// Root cause: LLM fees now post through `flux_usage`. The request log keeps provider evidence.
// Source: `server/docs/ai/adr/2026-10-04-flux-usage.md`.
// Removal condition: drop the table in a later migration after finance exports the history.
/** Historical whole-Flux billing evidence. */
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
  costSource: text('cost_source'),
  providerUsage: jsonb('provider_usage'),
  costUsd: text('cost_usd'),
  requestedFlux: bigint('requested_flux', { mode: 'number' }),
  chargedFlux: bigint('charged_flux', { mode: 'number' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  settledAt: timestamp('settled_at'),
}, table => [
  uniqueIndex('llm_settlement_user_request_uidx').on(table.userId, table.requestId),
  index('llm_settlement_status_created_idx').on(table.billingStatus, table.createdAt),
])
