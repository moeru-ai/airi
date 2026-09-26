import { bigint, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/** Durable cost receipt. Pending rows need reconciliation with the original price snapshot. */
export const llmCostReceipt = pgTable('llm_cost_receipt', {
  userId: text('user_id').notNull(),
  requestId: text('request_id').notNull(),
  generationId: text('generation_id'),
  model: text('model').notNull(),
  // Stable adapter ID, not the model vendor or client-supplied provider metadata.
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  pendingReason: text('pending_reason'),
  pricing: jsonb('pricing').notNull(),
  usage: jsonb('usage'),
  costUsd: text('cost_usd'),
  microFlux: bigint('micro_flux', { mode: 'number' }),
  charged: bigint('charged', { mode: 'number' }),
  requested: bigint('requested', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.requestId] }),
  index('llm_cost_receipt_pending_idx').on(table.status, table.createdAt),
])
