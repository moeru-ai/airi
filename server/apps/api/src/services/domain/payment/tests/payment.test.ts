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
    payment = createPaymentService(db, billing)

    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    await db.delete(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    await db.delete(schema.paymentCustomer).where(eq(schema.paymentCustomer.userId, 'user-pay-1'))
  })

  async function insertPendingOrder() {
    return payment.openPending({
      userId: 'user-pay-1',
      processor: 'stripe',
      packKey: 'starter',
      fluxAmount: 500,
      currency: 'usd',
    })
  }

  function paidReceipt(paymentOrderId: string, overrides: Partial<ClaimReceipt> = {}): ClaimReceipt {
    return {
      kind: 'claim',
      processor: 'stripe',
      paymentOrderId,
      processorOrderId: `cs_test_${paymentOrderId}`,
      status: 'paid',
      amount: 500,
      currency: 'usd',
      customerId: 'cus_test',
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
    expect(paid?.processorOrderId).toBe(`cs_test_${order.id}`)

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

  it('throws when settle runs before the order exists so the adapter can retry', async () => {
    await expect(payment.settle(paidReceipt('missing-order'))).rejects.toMatchObject({
      statusCode: 500,
    })
  })

  it('marks a pending order canceled without crediting Flux', async () => {
    const order = await insertPendingOrder()

    const result = await payment.settle({
      kind: 'claim',
      processor: 'stripe',
      paymentOrderId: order.id,
      processorOrderId: `cs_test_${order.id}`,
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
      processor: 'stripe',
      paymentOrderId: order.id,
      processorOrderId: `cs_test_${order.id}`,
      status: 'expired',
    })

    expect(result).toEqual({ applied: false })

    const [updated] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(updated?.status).toBe('expired')
  })

  it('deleteAllForUser soft-deletes orders and customers', async () => {
    const order = await insertPendingOrder()
    await db.insert(schema.paymentCustomer).values({
      userId: 'user-pay-1',
      processor: 'stripe',
      customerId: 'cus_test',
    })

    await payment.deleteAllForUser('user-pay-1')

    const [deletedOrder] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, order.id))
    expect(deletedOrder?.deletedAt).toBeInstanceOf(Date)

    const [deletedCustomer] = await db.select().from(schema.paymentCustomer).where(eq(schema.paymentCustomer.userId, 'user-pay-1'))
    expect(deletedCustomer?.deletedAt).toBeInstanceOf(Date)
  })

  it('openPending snapshots the pack and returns a live payment customer', async () => {
    await db.insert(schema.paymentCustomer).values({
      userId: 'user-pay-1',
      processor: 'stripe',
      customerId: 'cus_live',
    })

    const opened = await payment.openPending({
      userId: 'user-pay-1',
      processor: 'stripe',
      packKey: 'starter',
      fluxAmount: 500,
      currency: 'usd',
    })

    expect(opened.customerId).toBe('cus_live')

    const [row] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, opened.id))
    expect(row?.status).toBe('pending')
    expect(row?.packKey).toBe('starter')
    expect(row?.fluxAmount).toBe(500)
    expect(row?.processorOrderId).toBeNull()
  })

  it('openPending ignores a soft-deleted payment customer', async () => {
    await db.insert(schema.paymentCustomer).values({
      userId: 'user-pay-1',
      processor: 'stripe',
      customerId: 'cus_deleted',
      deletedAt: new Date(),
    })

    const opened = await payment.openPending({
      userId: 'user-pay-1',
      processor: 'stripe',
      packKey: 'starter',
      fluxAmount: 500,
    })

    expect(opened.customerId).toBeUndefined()
  })

  it('bindProcessorOrder does not overwrite an id that settle already stored', async () => {
    const opened = await insertPendingOrder()
    await payment.settle(paidReceipt(opened.id, { processorOrderId: 'cs_settle' }))

    await payment.bindProcessorOrder(opened.id, {
      processorOrderId: 'cs_bind',
      amount: 999,
    })

    const [row] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, opened.id))
    expect(row?.status).toBe('paid')
    expect(row?.processorOrderId).toBe('cs_settle')
    expect(row?.amount).toBe(500)
  })

  it('abandon marks a pending order canceled without crediting Flux', async () => {
    const opened = await insertPendingOrder()

    await payment.abandon(opened.id)

    const [row] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, opened.id))
    expect(row?.status).toBe('canceled')

    const ledger = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    expect(ledger).toHaveLength(0)
  })

  it('abandon does not reverse a paid order', async () => {
    const opened = await insertPendingOrder()
    await payment.settle(paidReceipt(opened.id))

    await payment.abandon(opened.id)

    const result = await payment.settle(paidReceipt(opened.id))
    expect(result.applied).toBe(false)

    const [row] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.id, opened.id))
    expect(row?.status).toBe('paid')

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)
  })
})
