import type Stripe from 'stripe'

import type { Database } from '../../libs/db'
import type { NewStripeCheckoutSession, NewStripeCustomer, NewStripeInvoice, NewStripeSubscription } from '../../schemas/stripe'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull, notInArray } from 'drizzle-orm'

import * as schema from '../../schemas/stripe'

const logger = useLogger('stripe-service')

export type StripeService = ReturnType<typeof createStripeService>

// NOTICE:
// Read paths filter `deletedAt IS NULL` so soft-deleted users (whose
// stripe_* rows persist for billing audit) are invisible to user-facing
// API. Webhooks that arrive after deletion still match by stripeCustomerId
// and re-upsert into the soft-deleted row — that's by design (the row
// remains deletedAt-set, but we capture the late event for accurate audit).
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export function createStripeService(db: Database, stripe: null | Stripe) {
  return {
    // ---- Customer ----

    /**
     * Cancel the user's active Stripe subscription via the API and stamp every
     * `stripe_*` row with `deletedAt`. Called from the user-deletion pipeline
     * (priority 10 — runs first because Stripe API cancellation has no
     * rollback path).
     *
     * Idempotent on retry: subsequent calls find no `active` subs to cancel
     * and the `WHERE deletedAt IS NULL` guard skips already-stamped rows.
     * Stripe `subscriptions.cancel` itself is also idempotent per spec —
     * cancelling an already-canceled sub returns 200.
     *
     * Cancellation is immediate, no proration, no refund — see
     * `server/apps/api/docs/ai-context/account-deletion.md`.
     */
    async deleteAllForUser(userId: string) {
      // Cancel every subscription that is NOT already in a terminal state.
      // Stripe's terminal statuses are `canceled` and `incomplete_expired`;
      // anything else (`active`, `trialing`, `past_due`, `unpaid`,
      // `incomplete`, `paused`) can still bill or transition into billing,
      // so leaving them uncancelled would charge a deleted account.
      // Stripe `subscriptions.cancel` is idempotent per spec — safe to
      // call on any non-terminal status.
      const cancellableSubs = await db.query.stripeSubscription.findMany({
        where: and(
          eq(schema.stripeSubscription.userId, userId),
          notInArray(schema.stripeSubscription.status, ['canceled', 'incomplete_expired']),
          isNull(schema.stripeSubscription.deletedAt),
        ),
      })

      if (stripe && cancellableSubs.length > 0) {
        for (const sub of cancellableSubs) {
          try {
            await stripe.subscriptions.cancel(sub.stripeSubscriptionId, {
              prorate: false,
            })
            logger.withFields({ prevStatus: sub.status, subscriptionId: sub.stripeSubscriptionId, userId }).log('Cancelled Stripe subscription')
          }
          catch (err) {
            logger.withError(err).withFields({ prevStatus: sub.status, subscriptionId: sub.stripeSubscriptionId, userId }).error('Failed to cancel Stripe subscription')
            throw err
          }
        }
      }
      else if (!stripe && cancellableSubs.length > 0) {
        logger.withFields({ cancellableSubCount: cancellableSubs.length, userId }).warn('Stripe SDK not configured; skipping API cancel — local rows will still be soft-deleted')
      }

      const now = new Date()

      await db.update(schema.stripeSubscription)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.stripeSubscription.userId, userId),
          isNull(schema.stripeSubscription.deletedAt),
        ))

      await db.update(schema.stripeCheckoutSession)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.stripeCheckoutSession.userId, userId),
          isNull(schema.stripeCheckoutSession.deletedAt),
        ))

      await db.update(schema.stripeInvoice)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.stripeInvoice.userId, userId),
          isNull(schema.stripeInvoice.deletedAt),
        ))

      await db.update(schema.stripeCustomer)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.stripeCustomer.userId, userId),
          isNull(schema.stripeCustomer.deletedAt),
        ))

      logger.withFields({ cancelledSubs: cancellableSubs.length, userId }).log('Stripe rows soft-deleted for user')
    },

    async getActiveSubscription(userId: string) {
      return db.query.stripeSubscription.findFirst({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        where: and(
          eq(schema.stripeSubscription.userId, userId),
          eq(schema.stripeSubscription.status, 'active'),
          isNull(schema.stripeSubscription.deletedAt),
        ),
      })
    },

    async getCheckoutSessionsByUserId(userId: string) {
      return db.query.stripeCheckoutSession.findMany({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        where: and(
          eq(schema.stripeCheckoutSession.userId, userId),
          isNull(schema.stripeCheckoutSession.deletedAt),
        ),
      })
    },

    // ---- Checkout Session ----

    async getCustomerByStripeId(stripeCustomerId: string) {
      // NOTICE: NOT filtering by deletedAt — this lookup is by external
      // Stripe id and is used by webhook handlers that need to reach
      // soft-deleted archive rows for late events (cancellation receipts,
      // final invoices arriving after account deletion). User-facing reads
      // use getCustomerByUserId which DOES filter.
      return db.query.stripeCustomer.findFirst({
        where: eq(schema.stripeCustomer.stripeCustomerId, stripeCustomerId),
      })
    },

    async getCustomerByUserId(userId: string) {
      return db.query.stripeCustomer.findFirst({
        where: and(
          eq(schema.stripeCustomer.userId, userId),
          isNull(schema.stripeCustomer.deletedAt),
        ),
      })
    },

    // ---- Subscription ----

    async getInvoicesByUserId(userId: string) {
      return db.query.stripeInvoice.findMany({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        where: and(
          eq(schema.stripeInvoice.userId, userId),
          isNull(schema.stripeInvoice.deletedAt),
        ),
      })
    },

    async upsertCheckoutSession(data: NewStripeCheckoutSession) {
      const [row] = await db.insert(schema.stripeCheckoutSession)
        .values(data)
        .onConflictDoUpdate({
          set: { ...data, updatedAt: new Date() },
          target: schema.stripeCheckoutSession.stripeSessionId,
        })
        .returning()
      logger.withFields({ sessionId: data.stripeSessionId, status: data.status, userId: data.userId }).log('Upserted checkout session')
      return row
    },

    // ---- Invoice ----

    async upsertCustomer(data: NewStripeCustomer) {
      const [row] = await db.insert(schema.stripeCustomer)
        .values(data)
        .onConflictDoUpdate({
          set: { ...data, updatedAt: new Date() },
          target: schema.stripeCustomer.stripeCustomerId,
        })
        .returning()
      logger.withFields({ stripeCustomerId: data.stripeCustomerId, userId: data.userId }).log('Upserted Stripe customer')
      return row
    },

    async upsertInvoice(data: NewStripeInvoice) {
      const [row] = await db.insert(schema.stripeInvoice)
        .values(data)
        .onConflictDoUpdate({
          set: { ...data, updatedAt: new Date() },
          target: schema.stripeInvoice.stripeInvoiceId,
        })
        .returning()
      logger.withFields({ invoiceId: data.stripeInvoiceId, status: data.status, userId: data.userId }).log('Upserted invoice')
      return row
    },

    async upsertSubscription(data: NewStripeSubscription) {
      const [row] = await db.insert(schema.stripeSubscription)
        .values(data)
        .onConflictDoUpdate({
          set: { ...data, updatedAt: new Date() },
          target: schema.stripeSubscription.stripeSubscriptionId,
        })
        .returning()
      logger.withFields({ status: data.status, subscriptionId: data.stripeSubscriptionId, userId: data.userId }).log('Upserted subscription')
      return row
    },
  }
}
