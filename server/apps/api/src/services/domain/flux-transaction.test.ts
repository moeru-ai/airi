import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxTransactionService } from './flux-transaction'

import * as schema from '../../schemas'

describe('fluxTransactionService', () => {
  let db: any
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

  it('shows a run of consecutive settlements as one row and ends it at any other row', async () => {
    const at = (second: number) => new Date(`2026-10-03T21:00:${String(second).padStart(2, '0')}Z`)
    const settlement = (id: string, second: number) => ({ id, userId: 'user-runs', type: 'debit', amount: 1, balanceBefore: 10, balanceAfter: 9, description: 'usage_settlement', createdAt: at(second) })
    await db.insert(schema.fluxTransaction).values([
      settlement('s-1', 1),
      settlement('s-2', 2),
      { id: 'top-up', userId: 'user-runs', type: 'credit', amount: 100, balanceBefore: 9, balanceAfter: 109, description: 'Top up', createdAt: at(3) },
      settlement('s-3', 4),
      settlement('s-4', 5),
      settlement('s-5', 6),
    ])

    const first = await service.getHistory('user-runs', 1, 0)
    const second = await service.getHistory('user-runs', 1, 1)
    const third = await service.getHistory('user-runs', 1, 2)

    expect(first.records).toEqual([expect.objectContaining({ id: 's-5', amount: 3, count: 3, firstAt: at(4) })])
    expect(first.hasMore).toBe(true)
    expect(second.records).toEqual([expect.objectContaining({ id: 'top-up', amount: 100, count: 1 })])
    expect(third.records).toEqual([expect.objectContaining({ id: 's-2', amount: 2, count: 2, firstAt: at(1) })])
    expect(third.hasMore).toBe(false)
  })

  it('keeps settlement runs separate for each user', async () => {
    await db.insert(schema.fluxTransaction).values([
      { id: 'other-1', userId: 'user-other', type: 'debit', amount: 1, balanceBefore: 5, balanceAfter: 4, description: 'usage_settlement', createdAt: new Date('2026-10-03T22:00:01Z') },
      { id: 'other-credit', userId: 'user-other', type: 'credit', amount: 5, balanceBefore: 4, balanceAfter: 9, description: 'Top up', createdAt: new Date('2026-10-03T22:00:02Z') },
    ])
    const { records } = await service.getHistory('user-runs', 10, 0)
    expect(records.find(record => record.id === 's-5')).toMatchObject({ count: 3 })
  })
})
