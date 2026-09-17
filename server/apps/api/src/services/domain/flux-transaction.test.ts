import { readFile } from 'node:fs/promises'

import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxTransactionService } from './flux-transaction'

import * as schema from '../../schemas'

describe('fluxTransactionService', () => {
  let db: Awaited<ReturnType<typeof mockDB>>
  let service: ReturnType<typeof createFluxTransactionService>

  beforeAll(async () => {
    db = await mockDB(schema)
    // mockDB applies table schemas, so install the production projection trigger too.
    const migration = await readFile(new URL('../../../drizzle/0024_tts_history_projection.sql', import.meta.url), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').filter(statement => statement.trim().startsWith('CREATE FUNCTION') || statement.trim().startsWith('CREATE TRIGGER'))) {
      await db.execute(sql.raw(statement))
    }
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

    const firstPage = await service.getHistory('user-history', 1, 0)
    const secondPage = await service.getHistory('user-history', 1, 1)

    expect(firstPage.records).toHaveLength(1)
    expect(firstPage.records[0]).toMatchObject({
      type: 'debit',
      id: 'history-b-1',
      amount: 3,
      metadata: { conversationId: 'conversation-b', roundId: 'round-1' },
    })
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.records).toHaveLength(1)
    expect(secondPage.records[0]).toMatchObject({
      type: 'debit',
      id: 'history-a-2',
      amount: 3,
      metadata: { conversationId: 'conversation-a', roundId: 'round-1' },
    })
    expect(secondPage.hasMore).toBe(false)
    expect(await service.getHistory('user-history', 1, 2)).toEqual({ records: [], hasMore: false })
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

    const page = await service.getHistory('user-legacy-history', 10, 0)

    expect(page.records).toEqual([
      expect.objectContaining({ id: 'legacy-tts-2' }),
      expect.objectContaining({ id: 'legacy-tts-1' }),
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

    const page = await service.getHistory('user-invalid-correlation', 10, 0)

    expect(page.records).toEqual([
      expect.objectContaining({ id: 'invalid-correlation-2' }),
      expect.objectContaining({ id: 'invalid-correlation-1' }),
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r4034741620
  it('returns the full round total as one ordinary record without child entries', async () => {
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

    const page = await service.getHistory('user-bounded-group', 10, 0)

    expect(page.records).toEqual([
      expect.objectContaining({
        id: 'bounded-group-50',
        type: 'debit',
        amount: 51,
      }),
    ])
    expect(page.records[0]).not.toHaveProperty('entries')
    expect(page.records[0]).not.toHaveProperty('chargeCount')
    expect(page.records[0]).not.toHaveProperty('historyGroupKey')
    // https://github.com/moeru-ai/airi/pull/2491#discussion_r4035448749
    // ROOT CAUSE:
    //
    // Returning database rows exposed private fields in the existing API.
    // Keep exactly the original six public fields, with only amount combined.
    expect(Object.keys(page.records[0]).sort()).toEqual([
      'amount',
      'createdAt',
      'description',
      'id',
      'metadata',
      'type',
    ])
    expect(page.hasMore).toBe(false)
    const ledger = await db.query.fluxTransaction.findMany({
      where: (transaction, { eq }) => eq(transaction.userId, 'user-bounded-group'),
    })
    expect(ledger).toHaveLength(51)
    expect(ledger.every(entry => entry.amount === 1)).toBe(true)
  })

  it('keeps equal correlation keys isolated between users', async () => {
    const historyGroupKey = '["tts_round","shared-chat","shared-round"]'
    await db.insert(schema.fluxTransaction).values([
      {
        id: 'owner-a',
        userId: 'history-owner-a',
        type: 'debit',
        amount: 2,
        balanceBefore: 10,
        balanceAfter: 8,
        description: 'tts_request',
        historyGroupKey,
        metadata: { conversationId: 'shared-chat', roundId: 'shared-round' },
      },
      {
        id: 'owner-b',
        userId: 'history-owner-b',
        type: 'debit',
        amount: 5,
        balanceBefore: 10,
        balanceAfter: 5,
        description: 'tts_request',
        historyGroupKey,
        metadata: { conversationId: 'shared-chat', roundId: 'shared-round' },
      },
    ])

    const page = await service.getHistory('history-owner-a', 10, 0)
    expect(page.records).toEqual([expect.objectContaining({ id: 'owner-a', amount: 2 })])
    expect(page.hasMore).toBe(false)
  })
})
