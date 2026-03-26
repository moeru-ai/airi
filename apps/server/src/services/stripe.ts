import type { Database } from '../libs/db'
import type { NewStripeCheckoutSession, NewStripeCustomer, NewStripeInvoice, NewStripeSubscription } from '../schemas/stripe'

import { useLogger } from '@guiiai/logg'
import { and, eq } from 'drizzle-orm'

import * as schema from '../schemas/stripe'

const logger = useLogger('stripe-service')

export function createStripeService(db: Database) {
  return {
    // ---- Customer ----

    async upsertCustomer(data: NewStripeCustomer) {
      const [row] = await db.insert(schema.stripeCustomer)
        .values(data)
        .onConflictDoUpdate({
          target: schema.stripeCustomer.stripeCustomerId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning()
      logger.withFields({ userId: data.userId, stripeCustomerId: data.stripeCustomerId }).log('Upserted Stripe customer')
      return row
    },

    async getCustomerByUserId(userId: string) {
      return db.query.stripeCustomer.findFirst({
        where: eq(schema.stripeCustomer.userId, userId),
      })
    },

    async getCustomerByStripeId(stripeCustomerId: string) {
      return db.query.stripeCustomer.findFirst({
        where: eq(schema.stripeCustomer.stripeCustomerId, stripeCustomerId),
      })
    },

    // ---- Checkout Session ----

    async upsertCheckoutSession(data: NewStripeCheckoutSession) {
      const [row] = await db.insert(schema.stripeCheckoutSession)
        .values(data)
        .onConflictDoUpdate({
          target: schema.stripeCheckoutSession.stripeSessionId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning()
      logger.withFields({ userId: data.userId, sessionId: data.stripeSessionId, status: data.status }).log('Upserted checkout session')
      return row
    },

    async getCheckoutSessionsByUserId(userId: string) {
      return db.query.stripeCheckoutSession.findMany({
        where: eq(schema.stripeCheckoutSession.userId, userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      })
    },

    // ---- Subscription ----

    async upsertSubscription(data: NewStripeSubscription) {
      const [row] = await db.insert(schema.stripeSubscription)
        .values(data)
        .onConflictDoUpdate({
          target: schema.stripeSubscription.stripeSubscriptionId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning()
      logger.withFields({ userId: data.userId, subscriptionId: data.stripeSubscriptionId, status: data.status }).log('Upserted subscription')
      return row
    },

    async getActiveSubscription(userId: string) {
      return db.query.stripeSubscription.findFirst({
        where: and(
          eq(schema.stripeSubscription.userId, userId),
          eq(schema.stripeSubscription.status, 'active'),
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      })
    },

    // ---- Invoice ----

    async upsertInvoice(data: NewStripeInvoice) {
      const [row] = await db.insert(schema.stripeInvoice)
        .values(data)
        .onConflictDoUpdate({
          target: schema.stripeInvoice.stripeInvoiceId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning()
      logger.withFields({ userId: data.userId, invoiceId: data.stripeInvoiceId, status: data.status }).log('Upserted invoice')
      return row
    },

    async getInvoicesByUserId(userId: string) {
      return db.query.stripeInvoice.findMany({
        where: eq(schema.stripeInvoice.userId, userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      })
    },
  }
}

export type StripeService = ReturnType<typeof createStripeService>
