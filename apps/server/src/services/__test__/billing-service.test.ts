import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createBillingService } from '../billing-service'
import { createOutboxService } from '../outbox-service'

import * as schema from '../../schemas'

describe('billingService', () => {
  let db: Database
  let outboxService: ReturnType<typeof createOutboxService>
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)
    outboxService = createOutboxService(db)
    billingService = createBillingService(db, outboxService)

    await db.insert(schema.user).values({
      id: 'user-billing-1',
      name: 'Billing User',
      email: 'billing@example.com',
    })
  })

  beforeEach(async () => {
    await db.delete(schema.outboxEvents)
    await db.delete(schema.fluxAuditLog)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    await db.delete(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))

    await db.insert(schema.stripeCheckoutSession).values({
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      mode: 'payment',
      status: 'complete',
      paymentStatus: 'paid',
      amountTotal: 500,
      currency: 'usd',
      fluxCredited: false,
    })
  })

  it('credits flux, records audit, and enqueues outbox events in one transaction', async () => {
    const result = await billingService.creditFluxFromStripeCheckout({
      stripeEventId: 'stripe-evt-1',
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      amountTotal: 500,
      currency: 'usd',
      fluxAmount: 50,
    })

    expect(result).toEqual({
      applied: true,
      balanceAfter: 50,
    })

    const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    expect(fluxRecord?.flux).toBe(50)

    const auditRecords = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-billing-1'))
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]?.amount).toBe(50)

    const outboxRecords = await db.select().from(schema.outboxEvents).orderBy(schema.outboxEvents.createdAt)
    expect(outboxRecords).toHaveLength(2)
    expect(outboxRecords.map(record => record.eventType)).toEqual(['flux.credited', 'stripe.checkout.completed'])

    const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
    expect(sessionRecord?.fluxCredited).toBe(true)
  })

  it('is idempotent when the checkout session was already credited', async () => {
    await billingService.creditFluxFromStripeCheckout({
      stripeEventId: 'stripe-evt-1',
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      amountTotal: 500,
      currency: 'usd',
      fluxAmount: 50,
    })

    const second = await billingService.creditFluxFromStripeCheckout({
      stripeEventId: 'stripe-evt-1',
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      amountTotal: 500,
      currency: 'usd',
      fluxAmount: 50,
    })

    expect(second).toEqual({ applied: false })

    const outboxRecords = await db.select().from(schema.outboxEvents)
    expect(outboxRecords).toHaveLength(2)
  })
})
