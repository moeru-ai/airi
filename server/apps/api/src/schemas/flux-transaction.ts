import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: ledger is permanent — bare userId (no FK) and no `deletedAt` column,
// both intentional. Entries must outlive the user row, and better-auth's
// hard-delete of user.id must not cascade-wipe the ledger.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const fluxTransaction = pgTable('flux_transaction', {
  amount: bigint('amount', { mode: 'number' }).notNull(), // always positive
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  description: text('description').notNull(),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  metadata: jsonb('metadata'), // { promptTokens, completionTokens, stripeSessionId, ... }
  requestId: text('request_id'), // nullable; used for idempotency on debit/credit
  type: text('type').notNull(), // 'credit' | 'debit' | 'initial' | 'promo' | 'admin_set'
  userId: text('user_id').notNull(),
}, table => [
  index('flux_tx_user_id_idx').on(table.userId),
  index('flux_tx_created_at_idx').on(table.createdAt),
  uniqueIndex('flux_tx_user_request_uniq')
    .on(table.userId, table.requestId)
    .where(sql`request_id IS NOT NULL`),
])
