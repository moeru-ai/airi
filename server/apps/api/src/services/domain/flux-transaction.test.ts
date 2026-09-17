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

  // https://github.com/moeru-ai/airi/pull/2491
  // ROOT CAUSE:
  //
  // The client grouped only its current raw page. One TTS round could split
  // across pages, and equal round IDs from two conversations could merge.
  //
  // The server now pages display rows and uses both correlation fields.
  it('groups TTS charges by conversation and round before pagination', async () => {
    const historyAKey = '["tts_round","conversation-a","round-1"]'
    const historyBKey = '["tts_round","conversation-b","round-1"]'
    await db.insert(schema.fluxTransaction).values([
      {
        id: 'history-a-1',
        userId: 'user-history',
        type: 'debit',
        amount: 1,
        balanceBefore: 10,
        balanceAfter: 9,
        description: 'tts_request',
        historyGroupKey: historyAKey,
        metadata: { conversationId: 'conversation-a', roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:01.000Z'),
      },
      {
        id: 'history-a-2',
        userId: 'user-history',
        type: 'debit',
        amount: 2,
        balanceBefore: 9,
        balanceAfter: 7,
        description: 'tts_request',
        historyGroupKey: historyAKey,
        metadata: { conversationId: 'conversation-a', roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:02.000Z'),
      },
      {
        id: 'history-b-1',
        userId: 'user-history',
        type: 'debit',
        amount: 3,
        balanceBefore: 7,
        balanceAfter: 4,
        description: 'tts_request',
        historyGroupKey: historyBKey,
        metadata: { conversationId: 'conversation-b', roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:03.000Z'),
      },
    ])
    await db.insert(schema.fluxHistoryRow).values([
      {
        userId: 'user-history',
        key: historyAKey,
        kind: 'tts_round',
        conversationId: 'conversation-a',
        roundId: 'round-1',
        description: 'tts_request',
        chargeCount: 2,
        totalAmount: 3,
        firstTime: new Date('2026-09-17T12:00:01.000Z'),
        lastTime: new Date('2026-09-17T12:00:02.000Z'),
        latestEntryId: 'history-a-2',
      },
      {
        userId: 'user-history',
        key: historyBKey,
        kind: 'tts_round',
        conversationId: 'conversation-b',
        roundId: 'round-1',
        description: 'tts_request',
        chargeCount: 1,
        totalAmount: 3,
        firstTime: new Date('2026-09-17T12:00:03.000Z'),
        lastTime: new Date('2026-09-17T12:00:03.000Z'),
        latestEntryId: 'history-b-1',
      },
    ])

    const firstPage = await service.getHistoryRows('user-history', 1, 0)
    const secondPage = await service.getHistoryRows('user-history', 1, 1)

    expect(firstPage.rows).toHaveLength(1)
    expect(firstPage.rows[0]).toMatchObject({
      type: 'group',
      conversationId: 'conversation-b',
      roundId: 'round-1',
      totalAmount: 3,
      chargeCount: 1,
    })
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.rows).toHaveLength(1)
    expect(secondPage.rows[0]).toMatchObject({
      type: 'group',
      conversationId: 'conversation-a',
      roundId: 'round-1',
      totalAmount: 3,
      chargeCount: 2,
    })
  })

  it('keeps TTS entries without a complete correlation pair separate', async () => {
    await db.insert(schema.fluxTransaction).values([
      {
        id: 'legacy-tts-1',
        userId: 'user-legacy-history',
        type: 'debit',
        amount: 1,
        balanceBefore: 2,
        balanceAfter: 1,
        description: 'tts_request',
        metadata: { roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:01.000Z'),
      },
      {
        id: 'legacy-tts-2',
        userId: 'user-legacy-history',
        type: 'debit',
        amount: 1,
        balanceBefore: 1,
        balanceAfter: 0,
        description: 'tts_request',
        metadata: { roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:02.000Z'),
      },
    ])
    await db.insert(schema.fluxHistoryRow).values([
      {
        userId: 'user-legacy-history',
        key: 'transaction:legacy-tts-1',
        kind: 'single',
        description: 'tts_request',
        chargeCount: 1,
        totalAmount: 1,
        firstTime: new Date('2026-09-17T12:00:01.000Z'),
        lastTime: new Date('2026-09-17T12:00:01.000Z'),
        latestEntryId: 'legacy-tts-1',
      },
      {
        userId: 'user-legacy-history',
        key: 'transaction:legacy-tts-2',
        kind: 'single',
        description: 'tts_request',
        chargeCount: 1,
        totalAmount: 1,
        firstTime: new Date('2026-09-17T12:00:02.000Z'),
        lastTime: new Date('2026-09-17T12:00:02.000Z'),
        latestEntryId: 'legacy-tts-2',
      },
    ])

    const page = await service.getHistoryRows('user-legacy-history', 10, 0)

    expect(page.rows).toEqual([
      { type: 'single', record: expect.objectContaining({ id: 'legacy-tts-2' }) },
      { type: 'single', record: expect.objectContaining({ id: 'legacy-tts-1' }) },
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r4034741609
  it('preserves every entry when stored correlation is invalid', async () => {
    // ROOT CAUSE:
    //
    // PostgreSQL btrim accepted a tab-only conversation ID that Valibot
    // rejected. The grouped fallback then returned only the newest entry.
    await db.insert(schema.fluxTransaction).values([
      {
        id: 'invalid-correlation-1',
        userId: 'user-invalid-correlation',
        type: 'debit',
        amount: 1,
        balanceBefore: 2,
        balanceAfter: 1,
        description: 'tts_request',
        metadata: { conversationId: '\t', roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:01.000Z'),
      },
      {
        id: 'invalid-correlation-2',
        userId: 'user-invalid-correlation',
        type: 'debit',
        amount: 1,
        balanceBefore: 1,
        balanceAfter: 0,
        description: 'tts_request',
        metadata: { conversationId: '\t', roundId: 'round-1' },
        createdAt: new Date('2026-09-17T12:00:02.000Z'),
      },
    ])
    await db.insert(schema.fluxHistoryRow).values([
      {
        userId: 'user-invalid-correlation',
        key: 'transaction:invalid-correlation-1',
        kind: 'single',
        description: 'tts_request',
        chargeCount: 1,
        totalAmount: 1,
        firstTime: new Date('2026-09-17T12:00:01.000Z'),
        lastTime: new Date('2026-09-17T12:00:01.000Z'),
        latestEntryId: 'invalid-correlation-1',
      },
      {
        userId: 'user-invalid-correlation',
        key: 'transaction:invalid-correlation-2',
        kind: 'single',
        description: 'tts_request',
        chargeCount: 1,
        totalAmount: 1,
        firstTime: new Date('2026-09-17T12:00:02.000Z'),
        lastTime: new Date('2026-09-17T12:00:02.000Z'),
        latestEntryId: 'invalid-correlation-2',
      },
    ])

    const page = await service.getHistoryRows('user-invalid-correlation', 10, 0)

    expect(page.rows).toEqual([
      { type: 'single', record: expect.objectContaining({ id: 'invalid-correlation-2' }) },
      { type: 'single', record: expect.objectContaining({ id: 'invalid-correlation-1' }) },
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r4034741620
  it('bounds the entry sample for one large billing-history group', async () => {
    const historyGroupKey = '["tts_round","conversation-1","round-1"]'
    await db.insert(schema.fluxTransaction).values(Array.from({ length: 51 }, (_, index) => ({
      id: `bounded-group-${index}`,
      userId: 'user-bounded-group',
      type: 'debit',
      amount: 1,
      balanceBefore: 51 - index,
      balanceAfter: 50 - index,
      description: 'tts_request',
      historyGroupKey,
      metadata: { conversationId: 'conversation-1', roundId: 'round-1' },
      createdAt: new Date(Date.UTC(2026, 8, 17, 12, 0, index)),
    })))
    await db.insert(schema.fluxHistoryRow).values({
      userId: 'user-bounded-group',
      key: historyGroupKey,
      kind: 'tts_round',
      conversationId: 'conversation-1',
      roundId: 'round-1',
      description: 'tts_request',
      chargeCount: 51,
      totalAmount: 51,
      firstTime: new Date('2026-09-17T12:00:00.000Z'),
      lastTime: new Date('2026-09-17T12:00:50.000Z'),
      latestEntryId: 'bounded-group-50',
    })

    const page = await service.getHistoryRows('user-bounded-group', 10, 0)

    expect(page.rows).toEqual([
      expect.objectContaining({
        type: 'group',
        chargeCount: 51,
        totalAmount: 51,
        entriesTruncated: true,
        entries: expect.any(Array),
      }),
    ])
    expect(page.rows[0]?.type === 'group' && page.rows[0].entries).toHaveLength(50)
  })
})
