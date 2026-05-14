import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: ledger is permanent — bare userId (no FK) and no `deletedAt` column,
// both intentional. Entries must outlive the user row, and better-auth's
// hard-delete of user.id must not cascade-wipe the ledger.
// See `apps/server/docs/ai-context/account-deletion.md`.
export const fluxTransaction = pgTable('flux_transaction', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'credit' | 'debit' | 'initial'
  amount: bigint('amount', { mode: 'number' }).notNull(), // always positive
  balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  requestId: text('request_id'), // nullable; used for idempotency on debit/credit
  description: text('description').notNull(),
  metadata: jsonb('metadata'), // { promptTokens, completionTokens, stripeSessionId, ... }
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('flux_tx_user_id_idx').on(table.userId),
  index('flux_tx_created_at_idx').on(table.createdAt),
  uniqueIndex('flux_tx_user_request_uniq')
    .on(table.userId, table.requestId)
    .where(sql`request_id IS NOT NULL`),
])
