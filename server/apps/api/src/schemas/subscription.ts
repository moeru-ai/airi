import type { InferSelectModel } from 'drizzle-orm'

import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows kept for
// billing audit. See `server/apps/api/docs/ai-context/account-deletion.md`.

export const subscriptionStatusValues = ['active', 'past_due', 'cancelled', 'expired'] as const

export type SubscriptionStatus = (typeof subscriptionStatusValues)[number]

/** One row per user and entitlement. Synced from RevenueCat webhooks. */
export const subscription = pgTable('subscription', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  entitlementId: text('entitlement_id').notNull(),
  productId: text('product_id'),
  store: text('store'),
  environment: text('environment'),
  status: text('status').notNull().$type<SubscriptionStatus>(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  uniqueIndex('subscription_user_entitlement_uidx')
    .on(table.userId, table.entitlementId)
    .where(sql`deleted_at IS NULL`),
  index('subscription_user_id_idx').on(table.userId),
])

/**
 * One row per paid billing period. Unused quota dies with the period —
 * upgrades open a new period from the effective date and forfeit the rest.
 */
export const subscriptionAllowance = pgTable('subscription_allowance', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  entitlementId: text('entitlement_id').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end'),
  grantedAmount: integer('granted_amount').notNull(),
  /** Whole Credits already settled out of the grant. */
  usedAmount: integer('used_amount').notNull().default(0),
  /** Micro-Credits charged but not yet settled into a whole Credit. */
  unsettledMicro: bigint('unsettled_micro', { mode: 'number' }).notNull().default(0),
  eventId: text('event_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('subscription_allowance_event_uidx')
    .on(table.eventId)
    .where(sql`event_id IS NOT NULL`),
  index('subscription_allowance_user_id_idx').on(table.userId),
])

/** One row per request charged to plan Credits. Guards retries from double-spending. */
export const subscriptionConsumption = pgTable('subscription_consumption', {
  requestId: text('request_id').primaryKey(),
  userId: text('user_id').notNull(),
  allowanceId: text('allowance_id').notNull(),
  amountMicro: bigint('amount_micro', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('subscription_consumption_user_id_idx').on(table.userId),
])

/** Whether LLM debit falls back to Flux after plan quota runs out. Defaults off. */
export const userBillingPreference = pgTable('user_billing_preference', {
  userId: text('user_id').primaryKey(),
  fallbackToFlux: boolean('fallback_to_flux').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Subscription = InferSelectModel<typeof subscription>
export type SubscriptionAllowance = InferSelectModel<typeof subscriptionAllowance>
export type SubscriptionConsumption = InferSelectModel<typeof subscriptionConsumption>
export type UserBillingPreference = InferSelectModel<typeof userBillingPreference>
