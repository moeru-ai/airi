import type { Database } from '../../../../libs/db'
import type { ConfigKVService } from '../../../adapters/config-kv'
import type { ClaimReceipt } from '../types'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { userFluxRedisKey } from '../../../../utils/redis-keys'
import { createBillingService } from '../../billing/billing-service'
import { createPaymentService } from '../index'

import * as schema from '../../../../schemas'

function createPacksConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async () => null),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

describe('payment CORE', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
  let payment: ReturnType<typeof createPaymentService>

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
    const billing = createBillingService(db, redis, createPacksConfigKV())
    payment = createPaymentService({ db, billing })

    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    await db.delete(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    await db.delete(schema.providerAccount).where(eq(schema.providerAccount.userId, 'user-pay-1'))
  })

  async function insertPendingOrder() {
    const [order] = await db.insert(schema.paymentOrder).values({
      userId: 'user-pay-1',
      provider: 'stripe',
      status: 'pending',
      packKey: 'starter',
      fluxAmount: 500,
      currency: 'usd',
    }).returning()
    return order!
  }

  function paidReceipt(paymentOrderId: string, overrides: Partial<ClaimReceipt> = {}): ClaimReceipt {
    return {
      kind: 'claim',
      provider: 'stripe',
      paymentOrderId,
      providerOrderId: `cs_test_${paymentOrderId}`,
      status: 'paid',
      amount: 500,
      currency: 'usd',
      providerCustomerId: 'cus_test',
      ...overrides,
    }
  }

  it('settle credits Flux from the pending order snapshot', async () => {
    const order = await insertPendingOrder()
    const result = await payment.settle(paidReceipt(order.id))

    expect(result).toMatchObject({ applied: true, fluxAmount: 500, balanceAfter: 500 })

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)

    const [ledger] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger?.amount).toBe(500)
    expect(ledger?.requestId).toBe(order.id)

    const [paid] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(paid?.status).toBe('paid')
    expect(paid?.creditedAt).toBeInstanceOf(Date)
    expect(paid?.packKey).toBe('starter')
    expect(paid?.fluxAmount).toBe(500)
    expect(paid?.providerOrderId).toBe(`cs_test_${order.id}`)

    expect(await redis.get(userFluxRedisKey('user-pay-1'))).toBe('500')
  })

  it('settle replay returns applied false and does not double credit', async () => {
    const order = await insertPendingOrder()
    const receipt = paidReceipt(order.id)

    const first = await payment.settle(receipt)
    const second = await payment.settle(receipt)

    expect(first.applied).toBe(true)
    expect(second.applied).toBe(false)

    const ledger = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger).toHaveLength(1)

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)
  })

  it('credits the snapshot on the pending row when the catalog amount differs', async () => {
    const order = await insertPendingOrder()

    const result = await payment.settle(paidReceipt(order.id))

    expect(result).toMatchObject({ applied: true, fluxAmount: 500 })

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)
  })

  it('throws when settle runs before the order exists so the channel can retry', async () => {
    await expect(payment.settle(paidReceipt('missing-order'))).rejects.toMatchObject({
      statusCode: 500,
    })
  })

  it('marks a pending order canceled without crediting Flux', async () => {
    const order = await insertPendingOrder()

    const result = await payment.settle({
      kind: 'claim',
      provider: 'stripe',
      paymentOrderId: order.id,
      providerOrderId: `cs_test_${order.id}`,
      status: 'canceled',
    })

    expect(result).toEqual({ applied: false })

    const [updated] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(updated?.status).toBe('canceled')

    const ledger = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger).toHaveLength(0)
  })

  it('marks a pending order expired without crediting Flux', async () => {
    const order = await insertPendingOrder()

    const result = await payment.settle({
      kind: 'claim',
      provider: 'stripe',
      paymentOrderId: order.id,
      providerOrderId: `cs_test_${order.id}`,
      status: 'expired',
    })

    expect(result).toEqual({ applied: false })

    const [updated] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(updated?.status).toBe('expired')
  })

  it('deleteAllForUser soft-deletes orders and accounts', async () => {
    const order = await insertPendingOrder()
    await db.insert(schema.providerAccount).values({
      userId: 'user-pay-1',
      provider: 'stripe',
      providerCustomerId: 'cus_test',
    })

    await payment.deleteAllForUser('user-pay-1')

    const [deletedOrder] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(deletedOrder?.deletedAt).toBeInstanceOf(Date)

    const [deletedAccount] = await db.select().from(schema.providerAccount).where(eq(schema.providerAccount.userId, 'user-pay-1'))
    expect(deletedAccount?.deletedAt).toBeInstanceOf(Date)
  })
})
