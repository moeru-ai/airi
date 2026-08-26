import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createStripeService } from './stripe'

import * as schema from '../../schemas'

describe('stripeService', () => {
  let db: Database
  let stripeService: ReturnType<typeof createStripeService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values([
      { email: 'stripe1@example.com', id: 'user-stripe-1', name: 'Stripe User 1' },
      { email: 'stripe2@example.com', id: 'user-stripe-2', name: 'Stripe User 2' },
    ])
  })

  beforeEach(async () => {
    stripeService = createStripeService(db, null)

    // Clean all stripe tables between tests
    await db.delete(schema.stripeInvoice)
    await db.delete(schema.stripeSubscription)
    await db.delete(schema.stripeCheckoutSession)
    await db.delete(schema.stripeCustomer)
  })

  // ---- Customer ----

  describe('upsertCustomer', () => {
    it('inserts a new customer', async () => {
      const result = await stripeService.upsertCustomer({
        email: 'stripe1@example.com',
        stripeCustomerId: 'cus_new_1',
        userId: 'user-stripe-1',
      })

      expect(result.userId).toBe('user-stripe-1')
      expect(result.stripeCustomerId).toBe('cus_new_1')
      expect(result.email).toBe('stripe1@example.com')
    })

    it('updates an existing customer on conflict (atomic upsert)', async () => {
      await stripeService.upsertCustomer({
        email: 'old@example.com',
        stripeCustomerId: 'cus_dup_1',
        userId: 'user-stripe-1',
      })

      const updated = await stripeService.upsertCustomer({
        email: 'new@example.com',
        name: 'Updated Name',
        stripeCustomerId: 'cus_dup_1',
        userId: 'user-stripe-1',
      })

      expect(updated.email).toBe('new@example.com')
      expect(updated.name).toBe('Updated Name')

      // Verify only one record exists
      const all = await db.select().from(schema.stripeCustomer).where(eq(schema.stripeCustomer.stripeCustomerId, 'cus_dup_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts for the same customer without error', async () => {
      // Simulate two webhook events arriving at the same time for the same customer
      const results = await Promise.all([
        stripeService.upsertCustomer({
          email: 'a@example.com',
          stripeCustomerId: 'cus_race_1',
          userId: 'user-stripe-1',
        }),
        stripeService.upsertCustomer({
          email: 'b@example.com',
          stripeCustomerId: 'cus_race_1',
          userId: 'user-stripe-1',
        }),
      ])

      // Both should succeed (no unique constraint violation)
      expect(results).toHaveLength(2)
      results.forEach(r => expect(r.stripeCustomerId).toBe('cus_race_1'))

      // Only one record should exist
      const all = await db.select().from(schema.stripeCustomer).where(eq(schema.stripeCustomer.stripeCustomerId, 'cus_race_1'))
      expect(all).toHaveLength(1)
    })
  })

  describe('getCustomerByUserId', () => {
    it('returns the customer for a given userId', async () => {
      await stripeService.upsertCustomer({
        stripeCustomerId: 'cus_lookup_1',
        userId: 'user-stripe-1',
      })

      const found = await stripeService.getCustomerByUserId('user-stripe-1')
      expect(found?.stripeCustomerId).toBe('cus_lookup_1')
    })

    it('returns undefined when no customer exists', async () => {
      const found = await stripeService.getCustomerByUserId('user-nonexistent')
      expect(found).toBeUndefined()
    })
  })

  describe('getCustomerByStripeId', () => {
    it('returns the customer for a given stripeCustomerId', async () => {
      await stripeService.upsertCustomer({
        stripeCustomerId: 'cus_sid_1',
        userId: 'user-stripe-1',
      })

      const found = await stripeService.getCustomerByStripeId('cus_sid_1')
      expect(found?.userId).toBe('user-stripe-1')
    })

    it('returns undefined when no customer exists', async () => {
      const found = await stripeService.getCustomerByStripeId('cus_nonexistent')
      expect(found).toBeUndefined()
    })
  })

  // ---- Checkout Session ----

  describe('upsertCheckoutSession', () => {
    it('inserts a new checkout session', async () => {
      const result = await stripeService.upsertCheckoutSession({
        amountTotal: 1000,
        currency: 'usd',
        mode: 'payment',
        paymentStatus: 'unpaid',
        status: 'open',
        stripeSessionId: 'cs_new_1',
        userId: 'user-stripe-1',
      })

      expect(result.stripeSessionId).toBe('cs_new_1')
      expect(result.amountTotal).toBe(1000)
      expect(result.fluxCredited).toBe(false)
    })

    it('updates an existing checkout session on conflict', async () => {
      await stripeService.upsertCheckoutSession({
        amountTotal: 1000,
        currency: 'usd',
        mode: 'payment',
        paymentStatus: 'unpaid',
        status: 'open',
        stripeSessionId: 'cs_upd_1',
        userId: 'user-stripe-1',
      })

      const updated = await stripeService.upsertCheckoutSession({
        amountTotal: 1000,
        currency: 'usd',
        mode: 'payment',
        paymentStatus: 'paid',
        status: 'complete',
        stripeSessionId: 'cs_upd_1',
        userId: 'user-stripe-1',
      })

      expect(updated.status).toBe('complete')
      expect(updated.paymentStatus).toBe('paid')

      const all = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'cs_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertCheckoutSession({
          amountTotal: 500,
          currency: 'usd',
          mode: 'payment',
          paymentStatus: 'unpaid',
          status: 'open',
          stripeSessionId: 'cs_race_1',
          userId: 'user-stripe-1',
        }),
        stripeService.upsertCheckoutSession({
          amountTotal: 500,
          currency: 'usd',
          mode: 'payment',
          paymentStatus: 'paid',
          status: 'complete',
          stripeSessionId: 'cs_race_1',
          userId: 'user-stripe-1',
        }),
      ])

      expect(results).toHaveLength(2)

      const all = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'cs_race_1'))
      expect(all).toHaveLength(1)
    })
  })

  describe('getCheckoutSessionsByUserId', () => {
    it('returns all sessions for the user', async () => {
      await stripeService.upsertCheckoutSession({
        amountTotal: 100,
        currency: 'usd',
        mode: 'payment',
        stripeSessionId: 'cs_list_1',
        userId: 'user-stripe-1',
      })
      await stripeService.upsertCheckoutSession({
        amountTotal: 200,
        currency: 'usd',
        mode: 'payment',
        stripeSessionId: 'cs_list_2',
        userId: 'user-stripe-1',
      })

      const sessions = await stripeService.getCheckoutSessionsByUserId('user-stripe-1')
      expect(sessions).toHaveLength(2)
      const ids = sessions.map(s => s.stripeSessionId)
      expect(ids).toContain('cs_list_1')
      expect(ids).toContain('cs_list_2')
    })

    it('does not return sessions from other users', async () => {
      await stripeService.upsertCheckoutSession({
        mode: 'payment',
        stripeSessionId: 'cs_iso_1',
        userId: 'user-stripe-1',
      })
      await stripeService.upsertCheckoutSession({
        mode: 'payment',
        stripeSessionId: 'cs_iso_2',
        userId: 'user-stripe-2',
      })

      const sessions = await stripeService.getCheckoutSessionsByUserId('user-stripe-1')
      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.stripeSessionId).toBe('cs_iso_1')
    })
  })

  // ---- Subscription ----

  describe('upsertSubscription', () => {
    it('inserts a new subscription', async () => {
      await stripeService.upsertCustomer({
        stripeCustomerId: 'cus_sub_1',
        userId: 'user-stripe-1',
      })

      const result = await stripeService.upsertSubscription({
        status: 'active',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_new_1',
        userId: 'user-stripe-1',
      })

      expect(result.stripeSubscriptionId).toBe('sub_new_1')
      expect(result.status).toBe('active')
    })

    it('updates an existing subscription on conflict', async () => {
      await stripeService.upsertSubscription({
        status: 'active',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_upd_1',
        userId: 'user-stripe-1',
      })

      const updated = await stripeService.upsertSubscription({
        status: 'canceled',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_upd_1',
        userId: 'user-stripe-1',
      })

      expect(updated.status).toBe('canceled')

      const all = await db.select().from(schema.stripeSubscription).where(eq(schema.stripeSubscription.stripeSubscriptionId, 'sub_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertSubscription({
          status: 'active',
          stripeCustomerId: 'cus_sub_1',
          stripeSubscriptionId: 'sub_race_1',
          userId: 'user-stripe-1',
        }),
        stripeService.upsertSubscription({
          status: 'past_due',
          stripeCustomerId: 'cus_sub_1',
          stripeSubscriptionId: 'sub_race_1',
          userId: 'user-stripe-1',
        }),
      ])

      expect(results).toHaveLength(2)

      const all = await db.select().from(schema.stripeSubscription).where(eq(schema.stripeSubscription.stripeSubscriptionId, 'sub_race_1'))
      expect(all).toHaveLength(1)
    })
  })

  describe('getActiveSubscription', () => {
    it('returns only the active subscription', async () => {
      await stripeService.upsertSubscription({
        status: 'canceled',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_active_1',
        userId: 'user-stripe-1',
      })
      await stripeService.upsertSubscription({
        status: 'active',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_active_2',
        userId: 'user-stripe-1',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active?.stripeSubscriptionId).toBe('sub_active_2')
      expect(active?.status).toBe('active')
    })

    it('returns undefined when no active subscription exists', async () => {
      await stripeService.upsertSubscription({
        status: 'canceled',
        stripeCustomerId: 'cus_sub_1',
        stripeSubscriptionId: 'sub_none_1',
        userId: 'user-stripe-1',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active).toBeUndefined()
    })

    it('does not return subscriptions from other users', async () => {
      await stripeService.upsertSubscription({
        status: 'active',
        stripeCustomerId: 'cus_other_1',
        stripeSubscriptionId: 'sub_other_1',
        userId: 'user-stripe-2',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active).toBeUndefined()
    })
  })

  // ---- Invoice ----

  describe('upsertInvoice', () => {
    it('inserts a new invoice', async () => {
      const result = await stripeService.upsertInvoice({
        amountDue: 2000,
        amountPaid: 0,
        currency: 'usd',
        status: 'open',
        stripeCustomerId: 'cus_inv_1',
        stripeInvoiceId: 'inv_new_1',
        userId: 'user-stripe-1',
      })

      expect(result.stripeInvoiceId).toBe('inv_new_1')
      expect(result.status).toBe('open')
      expect(result.fluxCredited).toBe(false)
    })

    it('updates an existing invoice on conflict', async () => {
      await stripeService.upsertInvoice({
        amountDue: 2000,
        amountPaid: 0,
        currency: 'usd',
        status: 'open',
        stripeInvoiceId: 'inv_upd_1',
        userId: 'user-stripe-1',
      })

      const updated = await stripeService.upsertInvoice({
        amountDue: 2000,
        amountPaid: 2000,
        currency: 'usd',
        status: 'paid',
        stripeInvoiceId: 'inv_upd_1',
        userId: 'user-stripe-1',
      })

      expect(updated.status).toBe('paid')
      expect(updated.amountPaid).toBe(2000)

      const all = await db.select().from(schema.stripeInvoice).where(eq(schema.stripeInvoice.stripeInvoiceId, 'inv_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertInvoice({
          amountDue: 1000,
          currency: 'usd',
          status: 'open',
          stripeInvoiceId: 'inv_race_1',
          userId: 'user-stripe-1',
        }),
        stripeService.upsertInvoice({
          amountPaid: 1000,
          currency: 'usd',
          status: 'paid',
          stripeInvoiceId: 'inv_race_1',
          userId: 'user-stripe-1',
        }),
      ])

      expect(results).toHaveLength(2)

      const all = await db.select().from(schema.stripeInvoice).where(eq(schema.stripeInvoice.stripeInvoiceId, 'inv_race_1'))
      expect(all).toHaveLength(1)
    })
  })

  describe('getInvoicesByUserId', () => {
    it('returns all invoices for the user', async () => {
      await stripeService.upsertInvoice({
        currency: 'usd',
        status: 'paid',
        stripeInvoiceId: 'inv_list_1',
        userId: 'user-stripe-1',
      })
      await stripeService.upsertInvoice({
        currency: 'usd',
        status: 'open',
        stripeInvoiceId: 'inv_list_2',
        userId: 'user-stripe-1',
      })

      const invoices = await stripeService.getInvoicesByUserId('user-stripe-1')
      expect(invoices).toHaveLength(2)
      const ids = invoices.map(i => i.stripeInvoiceId)
      expect(ids).toContain('inv_list_1')
      expect(ids).toContain('inv_list_2')
    })

    it('does not return invoices from other users', async () => {
      await stripeService.upsertInvoice({
        currency: 'usd',
        status: 'paid',
        stripeInvoiceId: 'inv_iso_1',
        userId: 'user-stripe-1',
      })
      await stripeService.upsertInvoice({
        currency: 'usd',
        status: 'paid',
        stripeInvoiceId: 'inv_iso_2',
        userId: 'user-stripe-2',
      })

      const invoices = await stripeService.getInvoicesByUserId('user-stripe-1')
      expect(invoices).toHaveLength(1)
      expect(invoices[0]?.stripeInvoiceId).toBe('inv_iso_1')
    })
  })
})
