import type { Database } from '../../libs/db'

import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxTransactionService } from './flux-transaction'

import * as schema from '../../schemas'

describe('fluxTransactionService', () => {
  let db: Database
  let service: ReturnType<typeof createFluxTransactionService>

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: 'user-tx',
      name: 'Transaction User',
      email: 'tx@example.com',
    })
    service = createFluxTransactionService(db)
  })

  it('log should insert a single transaction entry', async () => {
    await service.log({
      userId: 'user-tx',
      type: 'credit',
      amount: 500,
      balanceBefore: 0,
      balanceAfter: 500,
      description: 'Stripe payment',
      metadata: { stripeSessionId: 'sess_123' },
    })

    const { records } = await service.getHistory('user-tx', 10, 0)
    expect(records).toHaveLength(1)
    expect(records[0].type).toBe('credit')
    expect(records[0].amount).toBe(500)
  })

  it('logBatch should insert multiple entries', async () => {
    await service.logBatch([
      { userId: 'user-tx', type: 'debit', amount: 10, balanceBefore: 500, balanceAfter: 490, description: 'gpt-4o' },
      { userId: 'user-tx', type: 'debit', amount: 5, balanceBefore: 490, balanceAfter: 485, description: 'gpt-4o-mini' },
    ])

    const { records } = await service.getHistory('user-tx', 10, 0)
    expect(records).toHaveLength(3) // 1 from previous test + 2 batch
  })

  it('logBatch with empty array should be a no-op', async () => {
    await service.logBatch([])
    const { records } = await service.getHistory('user-tx', 10, 0)
    expect(records).toHaveLength(3)
  })

  it('getHistory should paginate correctly with hasMore', async () => {
    const { records, hasMore } = await service.getHistory('user-tx', 2, 0)
    expect(records).toHaveLength(2)
    expect(hasMore).toBe(true)
  })

  it('getHistory should return hasMore=false on last page', async () => {
    const { records, hasMore } = await service.getHistory('user-tx', 10, 0)
    expect(records).toHaveLength(3)
    expect(hasMore).toBe(false)
  })

  it('getHistory should respect offset', async () => {
    const { records } = await service.getHistory('user-tx', 10, 2)
    expect(records).toHaveLength(1)
  })

  it('getHistory should return records ordered by createdAt desc', async () => {
    const { records } = await service.getHistory('user-tx', 10, 0)
    for (let i = 1; i < records.length; i++) {
      expect(new Date(records[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(records[i].createdAt).getTime())
    }
  })

  it('groups one turn before pagination', async () => {
    await db.insert(schema.fluxTransaction).values([
      { id: 'round-1-a', userId: 'user-history', type: 'debit', amount: 1, balanceBefore: 3, balanceAfter: 2, description: 'tts_request', metadata: { turnId: 'round-1' }, createdAt: new Date('2026-09-18T01:00:00Z') },
      { id: 'round-1-b', userId: 'user-history', type: 'debit', amount: 1, balanceBefore: 2, balanceAfter: 1, description: 'tts_request', metadata: { turnId: 'round-1' }, createdAt: new Date('2026-09-18T01:00:01Z') },
      { id: 'round-2', userId: 'user-history', type: 'debit', amount: 1, balanceBefore: 1, balanceAfter: 0, description: 'tts_request', metadata: { turnId: 'round-2' }, createdAt: new Date('2026-09-18T01:00:02Z') },
    ])

    const firstPage = await service.getHistory('user-history', 1, 0)
    const secondPage = await service.getHistory('user-history', 1, 1)

    expect(firstPage.records).toEqual([expect.objectContaining({ id: 'round-2', amount: 1 })])
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.records).toEqual([expect.objectContaining({ id: 'round-1-b', amount: 2 })])
    expect(secondPage.hasMore).toBe(false)
  })

  it('attaches only paid orders owned by the wallet without changing pagination', async () => {
    await db.insert(schema.paymentOrder).values([
      { id: 'receipt-stripe', userId: 'receipt-buyer', processor: 'stripe', status: 'paid' },
      { id: 'receipt-apple', userId: 'receipt-buyer', processor: 'apple_iap', status: 'paid' },
      { id: 'receipt-foreign', userId: 'another-buyer', processor: 'stripe', status: 'paid' },
      { id: 'receipt-pending', userId: 'receipt-buyer', processor: 'stripe', status: 'pending' },
      { id: 'receipt-deleted', userId: 'receipt-buyer', processor: 'stripe', status: 'paid', deletedAt: new Date() },
    ])
    await db.insert(schema.fluxTransaction).values([
      { id: 'receipt-tx-1', userId: 'receipt-buyer', type: 'credit', requestId: 'receipt-stripe', amount: 100, balanceBefore: 0, balanceAfter: 100, description: 'Recharge', createdAt: new Date('2026-11-03T01:00:07Z') },
      { id: 'receipt-tx-2', userId: 'receipt-buyer', type: 'credit', requestId: 'receipt-apple', amount: 100, balanceBefore: 100, balanceAfter: 200, description: 'Recharge', createdAt: new Date('2026-11-03T01:00:06Z') },
      { id: 'receipt-tx-3', userId: 'receipt-buyer', type: 'credit', requestId: 'receipt-foreign', amount: 100, balanceBefore: 200, balanceAfter: 300, description: 'Unrelated credit', createdAt: new Date('2026-11-03T01:00:05Z') },
      { id: 'receipt-tx-4', userId: 'receipt-buyer', type: 'credit', requestId: 'receipt-pending', amount: 100, balanceBefore: 300, balanceAfter: 400, description: 'Unrelated credit', createdAt: new Date('2026-11-03T01:00:04Z') },
      { id: 'receipt-tx-5', userId: 'receipt-buyer', type: 'credit', requestId: 'receipt-deleted', amount: 100, balanceBefore: 400, balanceAfter: 500, description: 'Archived credit', createdAt: new Date('2026-11-03T01:00:03Z') },
      { id: 'receipt-tx-6', userId: 'receipt-buyer', type: 'promo', amount: 100, balanceBefore: 500, balanceAfter: 600, description: 'Gift', createdAt: new Date('2026-11-03T01:00:02Z') },
      { id: 'receipt-tx-7', userId: 'receipt-buyer', type: 'initial', amount: 100, balanceBefore: 600, balanceAfter: 700, description: 'Initial grant', createdAt: new Date('2026-11-03T01:00:01Z') },
    ])

    const firstPage = await service.getHistory('receipt-buyer', 2, 0)
    const secondPage = await service.getHistory('receipt-buyer', 10, 2)

    expect(firstPage.records.map(record => record.paymentOrderId)).toEqual(['receipt-stripe', 'receipt-apple'])
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.records.map(record => record.paymentOrderId)).toEqual([null, null, null, null, null])
    expect(secondPage.hasMore).toBe(false)
  })
})
