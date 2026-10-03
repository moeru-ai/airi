import { sql } from 'drizzle-orm'
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Service fees survive diagnostic log deletion. Posted fees never enter the wallet twice. */
export const fluxUsage = pgTable('flux_usage', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  service: text('service').notNull(),
  requestId: text('request_id').notNull(),
  attemptId: text('attempt_id'),
  turnId: text('turn_id'),
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
  /** NULL means unknown. Zero means a confirmed free usage event. */
  costMicroFlux: bigint('cost_micro_flux', { mode: 'number' }),
  /** Historical fees retain their original integer precision and are never repriced. */
  precision: text('precision').notNull().default('micro_flux'),
  /** Wallet effects can include fees from earlier events and other services. */
  requestedDebitFlux: bigint('requested_debit_flux', { mode: 'number' }),
  walletDebitFlux: bigint('wallet_debit_flux', { mode: 'number' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  settledAt: timestamp('settled_at'),
}, table => [
  uniqueIndex('flux_usage_user_service_request_uidx').on(table.userId, table.service, table.requestId),
  index('flux_usage_status_created_idx').on(table.billingStatus, table.createdAt),
  check('flux_usage_cost_nonnegative', sql`${table.costMicroFlux} >= 0`),
])
