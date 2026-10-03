import { sql } from 'drizzle-orm'
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: ledger is permanent — bare userId (no FK) and no `deletedAt` column,
// both intentional. Entries must outlive the user row, and better-auth's
// hard-delete of user.id must not cascade-wipe the ledger.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const fluxTransaction = pgTable('flux_transaction', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'credit' | 'debit' | 'accrual' | 'initial' | 'promo' | 'admin_set'
  amount: bigint('amount', { mode: 'number' }).notNull(), // Zero for accruals.
  balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  requestId: text('request_id'), // nullable; used for idempotency on debit/credit
  settlementId: text('settlement_id'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  amountMicroFlux: bigint('amount_micro_flux', { mode: 'number' }).notNull().default(0),
  unsettledBefore: bigint('unsettled_before', { mode: 'number' }),
  unsettledAfter: bigint('unsettled_after', { mode: 'number' }),
  triggerTransactionId: text('trigger_transaction_id'),
  operationId: text('operation_id'),
  description: text('description').notNull(),
  metadata: jsonb('metadata'), // { promptTokens, completionTokens, stripeSessionId, ... }
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('flux_tx_accrual_source_uidx').on(table.userId, table.sourceType, table.sourceId).where(sql`type = 'accrual'`),
  check('flux_tx_accrual_shape', sql`type != 'accrual' OR (amount = 0 AND balance_before = balance_after AND source_type IS NOT NULL AND source_id IS NOT NULL AND amount_micro_flux >= 0 AND unsettled_before IS NOT NULL AND unsettled_after IS NOT NULL AND unsettled_after = unsettled_before + amount_micro_flux)`),
  check('flux_tx_micro_nonnegative', sql`amount_micro_flux >= 0`),
  index('flux_tx_user_id_idx').on(table.userId),
  index('flux_tx_created_at_idx').on(table.createdAt),
  index('flux_tx_trigger_idx').on(table.triggerTransactionId),
  index('flux_tx_settlement_idx').on(table.settlementId),
  uniqueIndex('flux_tx_user_operation_uidx').on(table.userId, table.operationId).where(sql`operation_id IS NOT NULL`),
  uniqueIndex('flux_tx_user_request_uniq')
    .on(table.userId, table.requestId)
    .where(sql`request_id IS NOT NULL`),
])
