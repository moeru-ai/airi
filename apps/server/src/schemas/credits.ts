import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from './accounts'

export const userCredits = pgTable('user_credits', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  credits: integer('credits').notNull().default(0),
  stripeCustomerId: text('stripe_customer_id'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
