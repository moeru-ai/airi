import { sql } from 'drizzle-orm'
import { bigint, boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const userFlux = pgTable('user_flux', {
  userId: text('user_id').primaryKey(),
  flux: bigint('flux', { mode: 'number' }).notNull().default(0),
  unsettledMicroFlux: bigint('unsettled_micro_flux', { mode: 'number' }).notNull().default(0),
  /** Plan bucket. It refills at each reset boundary and counts as 0 once `planExpiresAt` has passed. */
  planFlux: bigint('plan_flux', { mode: 'number' }).notNull().default(0),
  planQuota: bigint('plan_quota', { mode: 'number' }).notNull().default(0),
  planExpiresAt: timestamp('plan_expires_at'),
  /** Start of the billing period that the payment channel reports. */
  planPeriodStart: timestamp('plan_period_start'),
  /** Last refill to the quota. A refill is due when this is before the reset boundary. */
  planFilledAt: timestamp('plan_filled_at'),
  /** An admin sets this to refill this one wallet once at that time. */
  planResetAt: timestamp('plan_reset_at'),
  /** With an active plan, spend purchased Flux after the plan bucket runs out. Off by default. */
  fallbackToFlux: boolean('fallback_to_flux').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  check('user_flux_unsettled_nonnegative', sql`${table.unsettledMicroFlux} >= 0`),
  check('user_flux_plan_nonnegative', sql`${table.planFlux} >= 0 AND ${table.planQuota} >= 0`),
])
