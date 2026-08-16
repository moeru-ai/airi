import type { Database } from '../../../../libs/db'
import type { ConfigKVService } from '../../../adapters/config-kv'
import type { FluxPack } from '../types'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { userFluxRedisKey } from '../../../../utils/redis-keys'
import { createBillingService } from '../../billing/billing-service'
import { createFakePaymentProvider } from '../adapters/fake'
import { createPaymentService } from '../index'

import * as schema from '../../../../schemas'

const starterPack: FluxPack = {
  key: 'starter',
  name: '500 Flux',
  fluxAmount: 500,
  recommended: false,
  providers: { stripe: { priceId: 'price_starter' } },
}

function createPacksConfigKV(initial: FluxPack[]): ConfigKVService & { setPacks: (packs: FluxPack[]) => void } {
  let packs = initial
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'FLUX_PACKS')
        return packs
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
    setPacks(next: FluxPack[]) {
      packs = next
    },
  } as ConfigKVService & { setPacks: (packs: FluxPack[]) => void }
}

describe('payment CORE', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
  let configKV: ReturnType<typeof createPacksConfigKV>
  let payment: ReturnType<typeof createPaymentService>
  let applyDuringCreate: boolean

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: 'user-pay-1',
      name: 'Pay User',
      email: 'pay@example.com',
    })
  })

  beforeEach(async () => {
    redis = createTestRedis()
    configKV = createPacksConfigKV([starterPack])
    applyDuringCreate = false
    const billing = createBillingService(db, redis, configKV)

    let service: ReturnType<typeof createPaymentService>
    const fake = createFakePaymentProvider({
      onCreate: async (input) => {
        if (!applyDuringCreate)
          return
        await service.applyConfirmation({
          provider: 'fake',
          paymentOrderId: input.paymentOrderId,
          providerOrderId: `fake_${input.paymentOrderId}`,
          status: 'paid',
          amount: 500,
          currency: 'usd',
          providerCustomerId: 'cus_fake',
        })
      },
    })

    service = createPaymentService({
      db,
      billing,
      configKV,
      providers: { fake },
    })
    payment = service

    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    await db.delete(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    await db.delete(schema.providerAccount).where(eq(schema.providerAccount.userId, 'user-pay-1'))
  })

  async function startStarterPack() {
    return payment.startPack({
      userId: 'user-pay-1',
      provider: 'fake',
      packKey: 'starter',
      startContext: {
        currency: 'usd',
        successUrl: 'https://example.test/success',
        cancelUrl: 'https://example.test/cancel',
        customerEmail: 'pay@example.com',
      },
    })
  }

  it('startPack snapshots the pack and applyConfirmation credits Flux', async () => {
    const started = await startStarterPack()
    expect(started.kind).toBe('redirect')
    expect(started.url).toContain('fake.pay.test')

    const result = await payment.applyConfirmation({
      provider: 'fake',
      paymentOrderId: started.paymentOrderId,
      providerOrderId: `fake_${started.paymentOrderId}`,
      status: 'paid',
      amount: 500,
      currency: 'usd',
      providerCustomerId: 'cus_fake',
    })

    expect(result).toMatchObject({ applied: true, fluxAmount: 500, balanceAfter: 500 })

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)

    const [ledger] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger?.amount).toBe(500)
    expect(ledger?.requestId).toBe(started.paymentOrderId)

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, started.paymentOrderId))
    expect(order?.status).toBe('paid')
    expect(order?.creditedAt).toBeInstanceOf(Date)
    expect(order?.packKey).toBe('starter')
    expect(order?.fluxAmount).toBe(500)

    expect(await redis.get(userFluxRedisKey('user-pay-1'))).toBe('500')
  })

  it('listPacks returns platform price items through the provider', async () => {
    const items = await payment.listPacks('fake')
    expect(items).toEqual([{
      packKey: 'starter',
      stripePriceId: 'price_starter',
      label: '500 Flux',
      defaultCurrency: 'usd',
      currencies: { usd: '$5.00' },
      recommended: false,
    }])
  })

  it('applyConfirmation replay returns applied false and does not double credit', async () => {
    const started = await startStarterPack()
    const facts = {
      provider: 'fake' as const,
      paymentOrderId: started.paymentOrderId,
      providerOrderId: `fake_${started.paymentOrderId}`,
      status: 'paid' as const,
    }

    const first = await payment.applyConfirmation(facts)
    const second = await payment.applyConfirmation(facts)

    expect(first.applied).toBe(true)
    expect(second.applied).toBe(false)

    const ledger = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger).toHaveLength(1)

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)
  })

  it('credits the snapshot when FLUX_PACKS changes after startPack', async () => {
    const started = await startStarterPack()
    configKV.setPacks([{ ...starterPack, fluxAmount: 9999 }])

    const result = await payment.applyConfirmation({
      provider: 'fake',
      paymentOrderId: started.paymentOrderId,
      providerOrderId: `fake_${started.paymentOrderId}`,
      status: 'paid',
    })

    expect(result).toMatchObject({ applied: true, fluxAmount: 500 })

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)
  })

  it('accepts webhook-before-checkout when the order exists and create has not returned', async () => {
    applyDuringCreate = true
    const started = await startStarterPack()

    expect(started.kind).toBe('redirect')

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, started.paymentOrderId))
    expect(order?.status).toBe('paid')
    expect(order?.providerOrderId).toBe(`fake_${started.paymentOrderId}`)
  })

  it('throws when applyConfirmation runs before the order exists so the channel can retry', async () => {
    await expect(payment.applyConfirmation({
      provider: 'fake',
      paymentOrderId: 'missing-order',
      providerOrderId: 'fake_missing',
      status: 'paid',
    })).rejects.toMatchObject({
      statusCode: 500,
    })
  })

  it('maps Fake.confirmed native payload onto applyConfirmation', async () => {
    const started = await startStarterPack()
    const fake = createFakePaymentProvider()
    const facts = fake.confirmed({
      paymentOrderId: started.paymentOrderId,
      providerOrderId: `fake_${started.paymentOrderId}`,
      status: 'paid',
      amount: 500,
      currency: 'usd',
    })

    const result = await payment.applyConfirmation(facts)
    expect(result).toMatchObject({ applied: true, fluxAmount: 500 })
  })
})
