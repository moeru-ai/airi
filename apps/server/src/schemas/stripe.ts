import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

/**
 * Stripe customers linked to our users.
 */
export const stripeCustomer = pgTable('stripe_customer', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Stripe checkout sessions – every checkout attempt is recorded.
 */
export const stripeCheckoutSession = pgTable('stripe_checkout_session', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id'),
  mode: text('mode').notNull(), // 'payment' | 'subscription' | 'setup'
  status: text('status'), // 'open' | 'complete' | 'expired'
  paymentStatus: text('payment_status'), // 'paid' | 'unpaid' | 'no_payment_required'
  amountTotal: integer('amount_total'), // in cents
  currency: text('currency'),
  successUrl: text('success_url'),
  cancelUrl: text('cancel_url'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  fluxCredited: boolean('flux_credited').notNull().default(false),
  metadata: text('metadata'), // JSON stringified
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Stripe subscriptions.
 */
export const stripeSubscription = pgTable('stripe_subscription', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripePriceId: text('stripe_price_id'),
  status: text('status').notNull(), // 'active' | 'past_due' | 'canceled' | 'incomplete' | etc
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end'),
  canceledAt: timestamp('canceled_at'),
  endedAt: timestamp('ended_at'),
  metadata: text('metadata'), // JSON stringified
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Stripe invoices – both one-time and subscription invoices.
 */
export const stripeInvoice = pgTable('stripe_invoice', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status'), // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  amountDue: integer('amount_due'), // in cents
  amountPaid: integer('amount_paid'), // in cents
  currency: text('currency'),
  invoiceUrl: text('invoice_url'),
  invoicePdf: text('invoice_pdf'),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  paidAt: timestamp('paid_at'),
  fluxCredited: boolean('flux_credited').notNull().default(false),
  metadata: text('metadata'), // JSON stringified
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ---------- Relations ----------

export const stripeCustomerRelations = relations(stripeCustomer, ({ one, many }) => ({
  user: one(user, { fields: [stripeCustomer.userId], references: [user.id] }),
  checkoutSessions: many(stripeCheckoutSession),
  subscriptions: many(stripeSubscription),
  invoices: many(stripeInvoice),
}))

export const stripeCheckoutSessionRelations = relations(stripeCheckoutSession, ({ one }) => ({
  user: one(user, { fields: [stripeCheckoutSession.userId], references: [user.id] }),
  customer: one(stripeCustomer, { fields: [stripeCheckoutSession.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
}))

export const stripeSubscriptionRelations = relations(stripeSubscription, ({ one }) => ({
  user: one(user, { fields: [stripeSubscription.userId], references: [user.id] }),
  customer: one(stripeCustomer, { fields: [stripeSubscription.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
}))

export const stripeInvoiceRelations = relations(stripeInvoice, ({ one }) => ({
  user: one(user, { fields: [stripeInvoice.userId], references: [user.id] }),
  customer: one(stripeCustomer, { fields: [stripeInvoice.stripeCustomerId], references: [stripeCustomer.stripeCustomerId] }),
}))

// ---------- Types ----------

export type StripeCustomer = InferSelectModel<typeof stripeCustomer>
export type NewStripeCustomer = InferInsertModel<typeof stripeCustomer>

export type StripeCheckoutSession = InferSelectModel<typeof stripeCheckoutSession>
export type NewStripeCheckoutSession = InferInsertModel<typeof stripeCheckoutSession>

export type StripeSubscription = InferSelectModel<typeof stripeSubscription>
export type NewStripeSubscription = InferInsertModel<typeof stripeSubscription>

export type StripeInvoice = InferSelectModel<typeof stripeInvoice>
export type NewStripeInvoice = InferInsertModel<typeof stripeInvoice>
