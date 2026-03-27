import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createStripeService } from '../stripe'

import * as schema from '../../schemas'

describe('stripeService', () => {
  let db: Database
  let stripeService: ReturnType<typeof createStripeService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values([
      { id: 'user-stripe-1', name: 'Stripe User 1', email: 'stripe1@example.com' },
      { id: 'user-stripe-2', name: 'Stripe User 2', email: 'stripe2@example.com' },
    ])
  })

  beforeEach(async () => {
    stripeService = createStripeService(db)

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
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_new_1',
        email: 'stripe1@example.com',
      })

      expect(result.userId).toBe('user-stripe-1')
      expect(result.stripeCustomerId).toBe('cus_new_1')
      expect(result.email).toBe('stripe1@example.com')
    })

    it('updates an existing customer on conflict (atomic upsert)', async () => {
      await stripeService.upsertCustomer({
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_dup_1',
        email: 'old@example.com',
      })

      const updated = await stripeService.upsertCustomer({
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_dup_1',
        email: 'new@example.com',
        name: 'Updated Name',
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
          userId: 'user-stripe-1',
          stripeCustomerId: 'cus_race_1',
          email: 'a@example.com',
        }),
        stripeService.upsertCustomer({
          userId: 'user-stripe-1',
          stripeCustomerId: 'cus_race_1',
          email: 'b@example.com',
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
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_lookup_1',
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
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_sid_1',
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
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_new_1',
        mode: 'payment',
        status: 'open',
        paymentStatus: 'unpaid',
        amountTotal: 1000,
        currency: 'usd',
      })

      expect(result.stripeSessionId).toBe('cs_new_1')
      expect(result.amountTotal).toBe(1000)
      expect(result.fluxCredited).toBe(false)
    })

    it('updates an existing checkout session on conflict', async () => {
      await stripeService.upsertCheckoutSession({
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_upd_1',
        mode: 'payment',
        status: 'open',
        paymentStatus: 'unpaid',
        amountTotal: 1000,
        currency: 'usd',
      })

      const updated = await stripeService.upsertCheckoutSession({
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_upd_1',
        mode: 'payment',
        status: 'complete',
        paymentStatus: 'paid',
        amountTotal: 1000,
        currency: 'usd',
      })

      expect(updated.status).toBe('complete')
      expect(updated.paymentStatus).toBe('paid')

      const all = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'cs_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertCheckoutSession({
          userId: 'user-stripe-1',
          stripeSessionId: 'cs_race_1',
          mode: 'payment',
          status: 'open',
          paymentStatus: 'unpaid',
          amountTotal: 500,
          currency: 'usd',
        }),
        stripeService.upsertCheckoutSession({
          userId: 'user-stripe-1',
          stripeSessionId: 'cs_race_1',
          mode: 'payment',
          status: 'complete',
          paymentStatus: 'paid',
          amountTotal: 500,
          currency: 'usd',
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
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_list_1',
        mode: 'payment',
        amountTotal: 100,
        currency: 'usd',
      })
      await stripeService.upsertCheckoutSession({
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_list_2',
        mode: 'payment',
        amountTotal: 200,
        currency: 'usd',
      })

      const sessions = await stripeService.getCheckoutSessionsByUserId('user-stripe-1')
      expect(sessions).toHaveLength(2)
      const ids = sessions.map(s => s.stripeSessionId)
      expect(ids).toContain('cs_list_1')
      expect(ids).toContain('cs_list_2')
    })

    it('does not return sessions from other users', async () => {
      await stripeService.upsertCheckoutSession({
        userId: 'user-stripe-1',
        stripeSessionId: 'cs_iso_1',
        mode: 'payment',
      })
      await stripeService.upsertCheckoutSession({
        userId: 'user-stripe-2',
        stripeSessionId: 'cs_iso_2',
        mode: 'payment',
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
        userId: 'user-stripe-1',
        stripeCustomerId: 'cus_sub_1',
      })

      const result = await stripeService.upsertSubscription({
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_new_1',
        stripeCustomerId: 'cus_sub_1',
        status: 'active',
      })

      expect(result.stripeSubscriptionId).toBe('sub_new_1')
      expect(result.status).toBe('active')
    })

    it('updates an existing subscription on conflict', async () => {
      await stripeService.upsertSubscription({
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_upd_1',
        stripeCustomerId: 'cus_sub_1',
        status: 'active',
      })

      const updated = await stripeService.upsertSubscription({
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_upd_1',
        stripeCustomerId: 'cus_sub_1',
        status: 'canceled',
      })

      expect(updated.status).toBe('canceled')

      const all = await db.select().from(schema.stripeSubscription).where(eq(schema.stripeSubscription.stripeSubscriptionId, 'sub_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertSubscription({
          userId: 'user-stripe-1',
          stripeSubscriptionId: 'sub_race_1',
          stripeCustomerId: 'cus_sub_1',
          status: 'active',
        }),
        stripeService.upsertSubscription({
          userId: 'user-stripe-1',
          stripeSubscriptionId: 'sub_race_1',
          stripeCustomerId: 'cus_sub_1',
          status: 'past_due',
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
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_active_1',
        stripeCustomerId: 'cus_sub_1',
        status: 'canceled',
      })
      await stripeService.upsertSubscription({
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_active_2',
        stripeCustomerId: 'cus_sub_1',
        status: 'active',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active?.stripeSubscriptionId).toBe('sub_active_2')
      expect(active?.status).toBe('active')
    })

    it('returns undefined when no active subscription exists', async () => {
      await stripeService.upsertSubscription({
        userId: 'user-stripe-1',
        stripeSubscriptionId: 'sub_none_1',
        stripeCustomerId: 'cus_sub_1',
        status: 'canceled',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active).toBeUndefined()
    })

    it('does not return subscriptions from other users', async () => {
      await stripeService.upsertSubscription({
        userId: 'user-stripe-2',
        stripeSubscriptionId: 'sub_other_1',
        stripeCustomerId: 'cus_other_1',
        status: 'active',
      })

      const active = await stripeService.getActiveSubscription('user-stripe-1')
      expect(active).toBeUndefined()
    })
  })

  // ---- Invoice ----

  describe('upsertInvoice', () => {
    it('inserts a new invoice', async () => {
      const result = await stripeService.upsertInvoice({
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_new_1',
        stripeCustomerId: 'cus_inv_1',
        status: 'open',
        amountDue: 2000,
        amountPaid: 0,
        currency: 'usd',
      })

      expect(result.stripeInvoiceId).toBe('inv_new_1')
      expect(result.status).toBe('open')
      expect(result.fluxCredited).toBe(false)
    })

    it('updates an existing invoice on conflict', async () => {
      await stripeService.upsertInvoice({
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_upd_1',
        status: 'open',
        amountDue: 2000,
        amountPaid: 0,
        currency: 'usd',
      })

      const updated = await stripeService.upsertInvoice({
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_upd_1',
        status: 'paid',
        amountDue: 2000,
        amountPaid: 2000,
        currency: 'usd',
      })

      expect(updated.status).toBe('paid')
      expect(updated.amountPaid).toBe(2000)

      const all = await db.select().from(schema.stripeInvoice).where(eq(schema.stripeInvoice.stripeInvoiceId, 'inv_upd_1'))
      expect(all).toHaveLength(1)
    })

    it('handles concurrent upserts without error', async () => {
      const results = await Promise.all([
        stripeService.upsertInvoice({
          userId: 'user-stripe-1',
          stripeInvoiceId: 'inv_race_1',
          status: 'open',
          amountDue: 1000,
          currency: 'usd',
        }),
        stripeService.upsertInvoice({
          userId: 'user-stripe-1',
          stripeInvoiceId: 'inv_race_1',
          status: 'paid',
          amountPaid: 1000,
          currency: 'usd',
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
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_list_1',
        status: 'paid',
        currency: 'usd',
      })
      await stripeService.upsertInvoice({
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_list_2',
        status: 'open',
        currency: 'usd',
      })

      const invoices = await stripeService.getInvoicesByUserId('user-stripe-1')
      expect(invoices).toHaveLength(2)
      const ids = invoices.map(i => i.stripeInvoiceId)
      expect(ids).toContain('inv_list_1')
      expect(ids).toContain('inv_list_2')
    })

    it('does not return invoices from other users', async () => {
      await stripeService.upsertInvoice({
        userId: 'user-stripe-1',
        stripeInvoiceId: 'inv_iso_1',
        status: 'paid',
        currency: 'usd',
      })
      await stripeService.upsertInvoice({
        userId: 'user-stripe-2',
        stripeInvoiceId: 'inv_iso_2',
        status: 'paid',
        currency: 'usd',
      })

      const invoices = await stripeService.getInvoicesByUserId('user-stripe-1')
      expect(invoices).toHaveLength(1)
      expect(invoices[0]?.stripeInvoiceId).toBe('inv_iso_1')
    })
  })
})
