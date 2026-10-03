import { bigint, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Speech authorization and measured units remain service evidence, independent of wallet settlement. */
export const speechBillingReceipt = pgTable('speech_billing_receipt', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  requestId: text('request_id').notNull(),
  model: text('model').notNull(),
  turnId: text('turn_id'),
  provider: text('provider'),
  pricing: jsonb('pricing').notNull(),
  units: bigint('units', { mode: 'number' }),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  postedAt: timestamp('posted_at'),
}, table => [uniqueIndex('speech_receipt_user_request_uidx').on(table.userId, table.requestId)])
