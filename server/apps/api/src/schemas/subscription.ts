import type { InferSelectModel } from 'drizzle-orm'

import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these archive rows kept for billing audit.
// See `server/apps/api/docs/ai-context/account-deletion.md`.

/**
 * One row per paid billing period. Unused quota dies with the period.
 * The user, entitlement, and period start identify the period that
 * RevenueCat reports, so a repeated sync updates the same row.
 */
export const subscriptionAllowance = pgTable('subscription_allowance', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  entitlementId: text('entitlement_id').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end'),
  grantedCredit: integer('granted_credit').notNull(),
  /** Whole Credits already settled out of the grant. */
  usedCredit: integer('used_credit').notNull().default(0),
  /** Micro-Credits charged but not yet settled into a whole Credit. */
  unsettledMicroCredit: bigint('unsettled_micro_credit', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('subscription_allowance_period_uidx')
    .on(table.userId, table.entitlementId, table.periodStart),
])

/** One row per request charged to plan Credits. Guards retries from double-spending. */
export const subscriptionConsumption = pgTable('subscription_consumption', {
  requestId: text('request_id').primaryKey(),
  userId: text('user_id').notNull(),
  allowanceId: text('allowance_id').notNull(),
  microCredit: bigint('micro_credit', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('subscription_consumption_user_id_idx').on(table.userId),
])

/** Chat and speech use the Flux wallet when plan Credits cannot cover the whole fee. Defaults off. */
export const userBillingPreference = pgTable('user_billing_preference', {
  userId: text('user_id').primaryKey(),
  fallbackToFlux: boolean('fallback_to_flux').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type SubscriptionAllowance = InferSelectModel<typeof subscriptionAllowance>
export type SubscriptionConsumption = InferSelectModel<typeof subscriptionConsumption>
export type UserBillingPreference = InferSelectModel<typeof userBillingPreference>
