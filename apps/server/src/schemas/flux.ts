import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `apps/server/docs/ai-context/account-deletion.md`.
export const userFlux = pgTable('user_flux', {
  userId: text('user_id').primaryKey(),
  flux: bigint('flux', { mode: 'number' }).notNull().default(0),
  stripeCustomerId: text('stripe_customer_id'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
