import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { sql } from 'drizzle-orm'
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows kept for
// billing audit. See `server/apps/api/docs/ai-context/account-deletion.md`.

export const paymentOrder = pgTable('payment_order', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerOrderId: text('provider_order_id'),
  status: text('status').notNull(),
  amount: integer('amount'),
  currency: text('currency'),
  packKey: text('pack_key'),
  fluxAmount: bigint('flux_amount', { mode: 'number' }),
  creditedAt: timestamp('credited_at'),
  providerData: jsonb('provider_data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  uniqueIndex('payment_order_provider_order_uidx')
    .on(table.provider, table.providerOrderId)
    .where(sql`provider_order_id IS NOT NULL`),
  index('payment_order_user_id_idx').on(table.userId),
])

export const providerAccount = pgTable('provider_account', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerCustomerId: text('provider_customer_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  uniqueIndex('provider_account_provider_customer_uidx')
    .on(table.provider, table.providerCustomerId)
    .where(sql`deleted_at IS NULL`),
  index('provider_account_user_id_idx').on(table.userId),
])

export type PaymentOrder = InferSelectModel<typeof paymentOrder>
export type NewPaymentOrder = InferInsertModel<typeof paymentOrder>
export type ProviderAccount = InferSelectModel<typeof providerAccount>
export type NewProviderAccount = InferInsertModel<typeof providerAccount>
