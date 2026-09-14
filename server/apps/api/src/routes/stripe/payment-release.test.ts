import type { Database } from '../../libs/db'

import Stripe from 'stripe'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { createConfigKVService } from '../../services/adapters/config-kv'
import { createConfigKVStore } from '../../services/adapters/config-kv/store'
import { createBillingService } from '../../services/domain/billing/billing-service'
import { createPaymentService } from '../../services/domain/payment'
import { createWebhookOperation } from './operations/webhook'

import * as schema from '../../schemas'

// https://github.com/moeru-ai/airi/pull/2335
// ROOT CAUSE:
// Checkout completion can precede payment. Migration snapshots also miss
// sessions created by old replicas. Exercise signed events against the ledger.
describe('pR #2335 payment release', () => {
  let db: Database
  let payment: ReturnType<typeof createPaymentService>
  let webhook: ReturnType<typeof createWebhookOperation>
  const stripe = new Stripe('sk_test_release')
  const secret = 'whsec_release_test'

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({ id: 'release-user', name: 'Release', email: 'release@example.com' })
  })

  beforeEach(async () => {
    await db.delete(schema.fluxTransaction)
    await db.delete(schema.userFlux)
    await db.delete(schema.paymentOrder)
    await db.delete(schema.paymentCustomer)
    await db.delete(schema.stripeCheckoutSession)
    const redis = createTestRedis()
    payment = createPaymentService(db, createBillingService(db, redis, createConfigKVService(createConfigKVStore(db, redis))))
    webhook = createWebhookOperation(stripe, secret, payment, db, null, null)
  })

  async function deliver(type: string, session: { id: string, payment_status: string, metadata?: { payment_order_id: string } }) {
    const payload = JSON.stringify({ id: `evt_${type}`, object: 'event', type, data: { object: {
      object: 'checkout.session',
      mode: 'payment',
      status: 'complete',
      amount_total: 300,
      currency: 'usd',
      customer: 'cus_release',
      ...session,
    } } })
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret })
    return webhook(signature, payload)
  }

  async function pending() {
    return payment.openPending({ userId: 'release-user', processor: 'stripe', packKey: 'flux-500', fluxAmount: 500 })
  }

  it('does not grant an unpaid completed session', async () => {
    const order = await pending()
    await deliver('checkout.session.completed', { id: 'cs_unpaid', payment_status: 'unpaid', metadata: { payment_order_id: order.id } })
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    const [stored] = await db.select().from(schema.paymentOrder)
    expect(stored.status).toBe('pending')
  })

  it('grants async success exactly once', async () => {
    const order = await pending()
    const session = { id: 'cs_async', payment_status: 'paid', metadata: { payment_order_id: order.id } }
    await deliver('checkout.session.async_payment_succeeded', session)
    await deliver('checkout.session.async_payment_succeeded', session)
    const ledger = await db.select().from(schema.fluxTransaction)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].amount).toBe(500)
  })

  it('adopts a session created by an old replica after migration', async () => {
    await db.insert(schema.stripeCheckoutSession).values({
      id: 'old-order',
      userId: 'release-user',
      stripeSessionId: 'cs_old',
      mode: 'payment',
      metadata: JSON.stringify({ userId: 'release-user', fluxAmount: '500' }),
    })
    await deliver('checkout.session.completed', { id: 'cs_old', payment_status: 'paid' })
    await deliver('checkout.session.completed', { id: 'cs_old', payment_status: 'paid' })
    const ledger = await db.select().from(schema.fluxTransaction)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].amount).toBe(500)
  })

  it('does not mutate archived orders or grant after deletion', async () => {
    const order = await pending()
    await payment.deleteAllForUser('release-user')
    await deliver('checkout.session.completed', { id: 'cs_deleted', payment_status: 'paid', metadata: { payment_order_id: order.id } })
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    const [stored] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(stored.status).toBe('pending')
    expect(await db.select().from(schema.paymentCustomer)).toHaveLength(0)
  })
  it('does not credit again when an old replica settled after the migration snapshot', async () => {
    const order = await pending()
    await payment.bindProcessorOrder(order.id, { processorOrderId: 'cs_old_paid' })
    await db.insert(schema.stripeCheckoutSession).values({ id: 'old-paid', userId: 'release-user', stripeSessionId: 'cs_old_paid', mode: 'payment', fluxCredited: true })
    await deliver('checkout.session.completed', { id: 'cs_old_paid', payment_status: 'paid' })
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    const [stored] = await db.select().from(schema.paymentOrder)
    expect(stored.status).toBe('paid')
  })

  it('rejects a receipt for a different processor', async () => {
    const order = await pending()
    await expect(payment.settle({ kind: 'claim', processor: 'steam', paymentOrderId: order.id, processorOrderId: 'other', status: 'paid' })).rejects.toThrow('Payment receipt does not match order')
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  })
})
