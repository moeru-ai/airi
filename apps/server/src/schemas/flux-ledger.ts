import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const fluxLedger = pgTable('flux_ledger', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'credit' | 'debit' | 'initial'
  amount: integer('amount').notNull(), // always positive
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  requestId: text('request_id'), // nullable; used for idempotency on debit/credit
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('flux_ledger_user_id_idx').on(table.userId),
  index('flux_ledger_created_at_idx').on(table.createdAt),
])
