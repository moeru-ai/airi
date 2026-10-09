import type { InferSelectModel } from 'drizzle-orm'

import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these archive rows kept for billing audit.
// See `server/apps/api/docs/ai-context/account-deletion.md`.

/** Append-only RevenueCat webhook log. `event_id` rejects a redelivery. */
export const revenuecatEvent = pgTable('revenuecat_event', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  appUserId: text('app_user_id'),
  productId: text('product_id'),
  entitlementIds: text('entitlement_ids').array().notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('revenuecat_event_event_id_uidx').on(table.eventId),
  index('revenuecat_event_app_user_id_idx').on(table.appUserId),
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
  grantedCredit: integer('granted_credit').notNull(),
  /** Whole Credits already settled out of the grant. */
  usedCredit: integer('used_credit').notNull().default(0),
  /** Micro-Credits charged but not yet settled into a whole Credit. */
  unsettledMicroCredit: bigint('unsettled_micro_credit', { mode: 'number' }).notNull().default(0),
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

export type RevenuecatEventRow = InferSelectModel<typeof revenuecatEvent>
export type SubscriptionAllowance = InferSelectModel<typeof subscriptionAllowance>
export type SubscriptionConsumption = InferSelectModel<typeof subscriptionConsumption>
export type UserBillingPreference = InferSelectModel<typeof userBillingPreference>
