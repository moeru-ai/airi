import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { user } from '@proj-airi/auth-shared'
import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare userId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows kept for
// audit / billing review.
// See `server/apps/api/docs/ai-context/account-deletion.md`.

/**
 * Stripe customers linked to our users.
 */
export const stripeCustomer = pgTable('stripe_customer', {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
  email: text('email'),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name'),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: text('user_id').notNull(),
})

/**
 * Stripe checkout sessions – every checkout attempt is recorded.
 */
export const stripeCheckoutSession = pgTable('stripe_checkout_session', {
  amountTotal: integer('amount_total'), // in cents
  cancelUrl: text('cancel_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  currency: text('currency'),
  deletedAt: timestamp('deleted_at'),
  expiresAt: timestamp('expires_at'),
  fluxCredited: boolean('flux_credited').notNull().default(false),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  metadata: text('metadata'), // JSON stringified
  mode: text('mode').notNull(), // 'payment' | 'subscription' | 'setup'
  paymentStatus: text('payment_status'), // 'paid' | 'unpaid' | 'no_payment_required'
  status: text('status'), // 'open' | 'complete' | 'expired'
  stripeCustomerId: text('stripe_customer_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  successUrl: text('success_url'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: text('user_id').notNull(),
})

/**
 * Stripe subscriptions.
 */
export const stripeSubscription = pgTable('stripe_subscription', {
  cancelAtPeriodEnd: boolean('cancel_at_period_end'),
  canceledAt: timestamp('canceled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  currentPeriodStart: timestamp('current_period_start'),
  deletedAt: timestamp('deleted_at'),
  endedAt: timestamp('ended_at'),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  metadata: text('metadata'), // JSON stringified
  status: text('status').notNull(), // 'active' | 'past_due' | 'canceled' | 'incomplete' | etc
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripePriceId: text('stripe_price_id'),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: text('user_id').notNull(),
})

/**
 * Stripe invoices – both one-time and subscription invoices.
 */
export const stripeInvoice = pgTable('stripe_invoice', {
  amountDue: integer('amount_due'), // in cents
  amountPaid: integer('amount_paid'), // in cents
  createdAt: timestamp('created_at').defaultNow().notNull(),
  currency: text('currency'),
  deletedAt: timestamp('deleted_at'),
  fluxCredited: boolean('flux_credited').notNull().default(false),
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  invoicePdf: text('invoice_pdf'),
  invoiceUrl: text('invoice_url'),
  metadata: text('metadata'), // JSON stringified
  paidAt: timestamp('paid_at'),
  periodEnd: timestamp('period_end'),
  periodStart: timestamp('period_start'),
  status: text('status'), // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  stripeCustomerId: text('stripe_customer_id'),
  stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: text('user_id').notNull(),
})

// ---------- Relations ----------

export const stripeCustomerRelations = relations(stripeCustomer, ({ many, one }) => ({
  checkoutSessions: many(stripeCheckoutSession),
  invoices: many(stripeInvoice),
  subscriptions: many(stripeSubscription),
  user: one(user, { fields: [stripeCustomer.userId], references: [user.id] }),
}))

export const stripeCheckoutSessionRelations = relations(stripeCheckoutSession, ({ one }) => ({
  customer: one(stripeCustomer, { fields: [stripeCheckoutSession.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
  user: one(user, { fields: [stripeCheckoutSession.userId], references: [user.id] }),
}))

export const stripeSubscriptionRelations = relations(stripeSubscription, ({ one }) => ({
  customer: one(stripeCustomer, { fields: [stripeSubscription.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
  user: one(user, { fields: [stripeSubscription.userId], references: [user.id] }),
}))

export const stripeInvoiceRelations = relations(stripeInvoice, ({ one }) => ({
  customer: one(stripeCustomer, { fields: [stripeInvoice.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
  user: one(user, { fields: [stripeInvoice.userId], references: [user.id] }),
}))

// ---------- Types ----------

export type NewStripeCheckoutSession = InferInsertModel<typeof stripeCheckoutSession>
export type NewStripeCustomer = InferInsertModel<typeof stripeCustomer>

export type NewStripeInvoice = InferInsertModel<typeof stripeInvoice>
export type NewStripeSubscription = InferInsertModel<typeof stripeSubscription>

export type StripeCheckoutSession = InferSelectModel<typeof stripeCheckoutSession>
export type StripeCustomer = InferSelectModel<typeof stripeCustomer>

export type StripeInvoice = InferSelectModel<typeof stripeInvoice>
export type StripeSubscription = InferSelectModel<typeof stripeSubscription>
