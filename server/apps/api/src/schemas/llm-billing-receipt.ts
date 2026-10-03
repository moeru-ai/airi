import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Durable billing evidence survives deletion of diagnostic requests and attempts. */
export const llmBillingReceipt = pgTable('llm_billing_receipt', {
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
  costMicroFlux: bigint('cost_micro_flux', { mode: 'number' }),
  precision: text('precision').notNull().default('micro_flux'),
  // Historical whole-Flux evidence. New receipts store costMicroFlux and leave these fields empty.
  requestedFlux: bigint('requested_flux', { mode: 'number' }),
  chargedFlux: bigint('charged_flux', { mode: 'number' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  settledAt: timestamp('settled_at'),
}, table => [
  uniqueIndex('llm_settlement_user_request_uidx').on(table.userId, table.requestId),
  index('llm_settlement_status_created_idx').on(table.billingStatus, table.createdAt),
])
