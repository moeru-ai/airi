import type { Database } from '../libs/db'
import type { NewStripeCheckoutSession, NewStripeCustomer, NewStripeInvoice, NewStripeSubscription } from '../schemas/stripe'

import { eq } from 'drizzle-orm'

import * as schema from '../schemas/stripe'

export function createStripeService(db: Database) {
  return {
    // ---- Customer ----

    async upsertCustomer(data: NewStripeCustomer) {
      const existing = await db.query.stripeCustomer.findFirst({
        where: eq(schema.stripeCustomer.stripeCustomerId, data.stripeCustomerId),
      })

      if (existing) {
        const [updated] = await db.update(schema.stripeCustomer)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.stripeCustomer.stripeCustomerId, data.stripeCustomerId))
          .returning()
        return updated
      }

      const [created] = await db.insert(schema.stripeCustomer)
        .values(data)
        .returning()
      return created
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
      const existing = await db.query.stripeCheckoutSession.findFirst({
        where: eq(schema.stripeCheckoutSession.stripeSessionId, data.stripeSessionId),
      })

      if (existing) {
        const [updated] = await db.update(schema.stripeCheckoutSession)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.stripeCheckoutSession.stripeSessionId, data.stripeSessionId))
          .returning()
        return updated
      }

      const [created] = await db.insert(schema.stripeCheckoutSession)
        .values(data)
        .returning()
      return created
    },

    async getCheckoutSessionsByUserId(userId: string) {
      return db.query.stripeCheckoutSession.findMany({
        where: eq(schema.stripeCheckoutSession.userId, userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      })
    },

    // ---- Subscription ----

    async upsertSubscription(data: NewStripeSubscription) {
      const existing = await db.query.stripeSubscription.findFirst({
        where: eq(schema.stripeSubscription.stripeSubscriptionId, data.stripeSubscriptionId),
      })

      if (existing) {
        const [updated] = await db.update(schema.stripeSubscription)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.stripeSubscription.stripeSubscriptionId, data.stripeSubscriptionId))
          .returning()
        return updated
      }

      const [created] = await db.insert(schema.stripeSubscription)
        .values(data)
        .returning()
      return created
    },

    async getActiveSubscription(userId: string) {
      return db.query.stripeSubscription.findFirst({
        where: eq(schema.stripeSubscription.userId, userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      })
    },

    // ---- Invoice ----

    async upsertInvoice(data: NewStripeInvoice) {
      const existing = await db.query.stripeInvoice.findFirst({
        where: eq(schema.stripeInvoice.stripeInvoiceId, data.stripeInvoiceId),
      })

      if (existing) {
        const [updated] = await db.update(schema.stripeInvoice)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.stripeInvoice.stripeInvoiceId, data.stripeInvoiceId))
          .returning()
        return updated
      }

      const [created] = await db.insert(schema.stripeInvoice)
        .values(data)
        .returning()
      return created
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
