import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const fluxAuditLog = pgTable('flux_audit_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'consumption' | 'addition' | 'initial'
  amount: integer('amount').notNull(), // positive = gain, negative = spend
  description: text('description').notNull(), // model name, "Stripe payment", "Initial grant", etc.
  metadata: jsonb('metadata'), // { promptTokens, completionTokens, stripeSessionId, ... }
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
