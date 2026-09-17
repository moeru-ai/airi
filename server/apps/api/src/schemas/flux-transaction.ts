import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: ledger is permanent — bare userId (no FK) and no `deletedAt` column,
// both intentional. Entries must outlive the user row, and better-auth's
// hard-delete of user.id must not cascade-wipe the ledger.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const fluxTransaction = pgTable('flux_transaction', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'credit' | 'debit' | 'initial' | 'promo' | 'admin_set'
  amount: bigint('amount', { mode: 'number' }).notNull(), // always positive
  balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  requestId: text('request_id'), // nullable; used for idempotency on debit/credit
  description: text('description').notNull(),
  metadata: jsonb('metadata'), // { promptTokens, completionTokens, stripeSessionId, ... }
  historyGroupKey: text('history_group_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('flux_tx_user_id_idx').on(table.userId),
  index('flux_tx_created_at_idx').on(table.createdAt),
  index('flux_tx_user_history_group_idx').on(table.userId, table.historyGroupKey, table.createdAt.desc(), table.id.desc()),
  uniqueIndex('flux_tx_user_request_uniq')
    .on(table.userId, table.requestId)
    .where(sql`request_id IS NOT NULL`),
])

// NOTICE:
// A database trigger owns this projection so every ledger writer updates it
// in the same transaction. The application only reads these aggregates.
// See server/docs/ai/adr/2026-09-17-tts-flux-history-read-model.md.
export const fluxHistoryRow = pgTable('flux_history_row', {
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  kind: text('kind').notNull(),
  conversationId: text('conversation_id'),
  roundId: text('round_id'),
  description: text('description').notNull(),
  chargeCount: integer('charge_count').notNull(),
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
  firstTime: timestamp('first_time').notNull(),
  lastTime: timestamp('last_time').notNull(),
  latestEntryId: text('latest_entry_id').notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.key] }),
  index('flux_history_row_user_last_idx').on(table.userId, table.lastTime.desc(), table.key.desc()),
  check('flux_history_row_kind_check', sql`${table.kind} IN ('single', 'tts_round')`),
  check('flux_history_row_correlation_check', sql`(
    ${table.kind} = 'single'
    AND ${table.conversationId} IS NULL
    AND ${table.roundId} IS NULL
  ) OR (
    ${table.kind} = 'tts_round'
    AND ${table.conversationId} IS NOT NULL
    AND ${table.roundId} IS NOT NULL
    AND char_length(${table.conversationId}) BETWEEN 1 AND 128
    AND char_length(${table.roundId}) BETWEEN 1 AND 128
  )`),
])
