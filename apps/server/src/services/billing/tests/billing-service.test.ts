import type Redis from 'ioredis'

import type { Database } from '../../../libs/db'
import type { MqService } from '../../../libs/mq'
import type { createConfigKVService } from '../../config-kv'
import type { BillingEvent } from '../billing-events'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { DEFAULT_BILLING_EVENTS_STREAM, userFluxRedisKey } from '../../../utils/redis-keys'
import { createBillingService } from '../billing-service'

import * as schema from '../../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

function createMockRedis(): Redis {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
  } as unknown as Redis
}

function createMockBillingMq(): MqService<BillingEvent> {
  return {
    stream: DEFAULT_BILLING_EVENTS_STREAM,
    publish: vi.fn(async () => '1-0'),
    ensureConsumerGroup: vi.fn(async () => true),
    consume: vi.fn(async () => []),
    claimIdleMessages: vi.fn(async () => []),
    ack: vi.fn(async () => 1),
  } as any
}

describe('billingService', () => {
  let db: Database
  let redis: Redis
  let billingMq: MqService<BillingEvent>
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      id: 'user-billing-1',
      name: 'Billing User',
      email: 'billing@example.com',
    })
  })

  beforeEach(async () => {
    redis = createMockRedis()
    billingMq = createMockBillingMq()
    billingService = createBillingService(db, redis, billingMq, createMockConfigKV())

    await db.delete(schema.fluxTransaction)
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

  describe('creditFluxFromStripeCheckout', () => {
    it('credits flux, records transaction, and enqueues outbox events in one transaction', async () => {
      const result = await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      expect(result).toEqual({ applied: true, balanceAfter: 50 })

      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(50)

      // Verify transaction entry
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
      expect(txRecords[0]?.type).toBe('credit')
      expect(txRecords[0]?.amount).toBe(50)
      expect(txRecords[0]?.balanceBefore).toBe(0)
      expect(txRecords[0]?.balanceAfter).toBe(50)

      // Verify metadata on transaction entry
      expect(txRecords[0]?.metadata).toMatchObject({
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
        source: 'stripe.checkout.completed',
      })

      // Verify billing events published to stream
      expect(billingMq.publish).toHaveBeenCalledTimes(2)
      expect(billingMq.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'flux.credited' }))
      expect(billingMq.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'stripe.checkout.completed' }))

      // Verify stripe session marked as credited
      const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
      expect(sessionRecord?.fluxCredited).toBe(true)

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '50')
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

      // Only 2 publish calls from the first invocation
      expect(billingMq.publish).toHaveBeenCalledTimes(2)
    })
  })

  describe('consumeFluxForLLM', () => {
    it('deducts balance, publishes flux.debited event, updates Redis', async () => {
      // Setup: give user some flux first
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })

      const result = await billingService.consumeFluxForLLM({
        userId: 'user-billing-1',
        amount: 30,
        requestId: 'req-1',
        description: 'gpt-4',
        promptTokens: 120,
        completionTokens: 80,
      })

      expect(result).toEqual({ userId: 'user-billing-1', flux: 70 })

      // Verify DB balance
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(70)

      // Verify flux.debited event published to stream (transaction written by consumer)
      expect(billingMq.publish).toHaveBeenCalledTimes(1)
      expect(billingMq.publish).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'flux.debited',
        userId: 'user-billing-1',
        payload: expect.objectContaining({
          amount: 30,
          balanceAfter: 70,
          description: 'gpt-4',
          metadata: { promptTokens: 120, completionTokens: 80 },
        }),
      }))

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '70')
    })

    it('throws 402 when balance is insufficient', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 5 })

      await expect(billingService.consumeFluxForLLM({
        userId: 'user-billing-1',
        amount: 10,
      })).rejects.toThrow('Insufficient flux')

      // Verify no side effects
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(5)

      const txRecords = await db.select().from(schema.fluxTransaction)
      expect(txRecords).toHaveLength(0)

      // Verify no event was published
      expect(billingMq.publish).not.toHaveBeenCalled()
    })
  })

  describe('creditFlux', () => {
    it('credits balance with transaction + outbox', async () => {
      const result = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 50,
        description: 'Admin grant',
        source: 'admin',
      })

      expect(result.balanceAfter).toBe(50)
      expect(result.balanceBefore).toBe(0)

      // Verify transaction
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
      expect(txRecords[0]).toMatchObject({
        type: 'credit',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
      })

      // Verify billing event published to stream
      expect(billingMq.publish).toHaveBeenCalledTimes(1)
      expect(billingMq.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'flux.credited' }))
    })
  })
})
