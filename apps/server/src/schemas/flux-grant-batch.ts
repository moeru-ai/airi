import { sql } from 'drizzle-orm'
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/**
 * Admin-issued FLUX grant batch (e.g. promotional rounds, customer
 * compensation rounds, manual top-ups). One row = one batch operation.
 *
 * Naming: this table represents the **container** for a single
 * "send N FLUX to M users" operation, nothing more. It is not a generic
 * marketing campaign abstraction — adding optional codes / discounts /
 * referral rewards in future is a different schema, not a column on this one.
 *
 * - `type` is a comment-only enum mirroring `flux_transaction.type`. v1 only
 *   supports `'promo'`. Adding a new value here means also extending the
 *   ledger type set.
 * - `created_by_user_id` is bare text (no FK to user.id) for the same reason
 *   ledger entries are: better-auth hard-deletes user rows and we want the
 *   audit trail to outlive the operator's account.
 *
 * status state machine:
 *   created → running → completed         (all granted)
 *   created → running → failed_partial    (some failed/skipped, no more pending)
 */
export const fluxGrantBatch = pgTable('flux_grant_batch', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'promo'
  amount: bigint('amount', { mode: 'number' }).notNull(),
  description: text('description'),
  status: text('status').notNull(), // 'created' | 'running' | 'completed' | 'failed_partial'
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, table => [
  index('flux_grant_batch_status_idx').on(table.status),
  index('flux_grant_batch_created_by_idx').on(table.createdByUserId),
])

/**
 * Per-recipient row for a flux grant batch. One row per input email.
 * Resolution (email → userId) happens at batch creation time, so worker
 * execution is a pure "lookup pending → call creditFlux" loop.
 *
 * - `input_email` preserves the operator's original input verbatim
 *   (case included) for auditability. Lookup uses LOWER(email) match.
 * - `user_id` is nullable: NULL means email did not match any user
 *   (errorReason='not_found') or the row is a duplicate that we kept
 *   only for audit (errorReason='duplicate_in_input').
 * - `flux_transaction_id` is back-filled after a successful grant so
 *   reports can join the ledger row directly.
 *
 * Partial index on `status='pending'` keeps the worker's polling query
 * cheap regardless of how many granted rows accumulate.
 */
export const fluxGrantBatchRecipient = pgTable('flux_grant_batch_recipient', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  batchId: text('batch_id').notNull(),
  inputEmail: text('input_email').notNull(),
  userId: text('user_id'),
  status: text('status').notNull(), // 'pending' | 'granted' | 'skipped' | 'failed'
  errorReason: text('error_reason'),
  fluxTransactionId: text('flux_transaction_id'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptedAt: timestamp('last_attempted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('flux_grant_batch_recipient_batch_status_idx').on(table.batchId, table.status),
  index('flux_grant_batch_recipient_pending_idx')
    .on(table.status, table.lastAttemptedAt)
    .where(sql`status = 'pending'`),
  uniqueIndex('flux_grant_batch_recipient_batch_email_uniq').on(table.batchId, table.inputEmail),
])
