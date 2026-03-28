import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from './accounts'

export const userFlux = pgTable('user_flux', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  flux: bigint('flux', { mode: 'number' }).notNull().default(0),
  stripeCustomerId: text('stripe_customer_id'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
