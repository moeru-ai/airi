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

  describe('getDailyUsage', () => {
    const now = new Date('2026-10-25T12:00:00Z')

    function usage(userId: string, sourceType: string, sourceId: string, amountMicroFlux: number, createdAt: string) {
      return { userId, sourceType, sourceId, amountMicroFlux, createdAt: new Date(createdAt) }
    }

    function request(userId: string, sessionId: string | null, createdAt: string) {
      return { userId, sessionId, model: 'chat-model', status: 200, durationMs: 10, createdAt: new Date(createdAt) }
    }

    it('returns 365 zero-filled local days and puts fees on the day of the caller time zone', async () => {
      await db.insert(schema.fluxUsage).values([
        usage('user-daily', 'llm', 'llm-1', 2_000_000, '2026-10-24T17:00:00Z'),
        usage('user-daily', 'llm', 'llm-2', 1_000_000, '2026-10-24T10:00:00Z'),
        usage('user-daily', 'tts', 'tts-1', 500_000, '2026-10-25T02:00:00Z'),
      ])

      const shanghai = await service.getDailyUsage('user-daily', 'Asia/Shanghai', now)
      const utc = await service.getDailyUsage('user-daily', 'UTC', now)
      const dayOf = (result: typeof shanghai, date: string) => result.days.find(day => day.date === date)

      expect(shanghai.days).toHaveLength(365)
      expect(shanghai.days[0]!.date).toBe('2025-10-26')
      expect(shanghai.days.at(-1)!.date).toBe('2026-10-25')
      expect(dayOf(shanghai, '2026-10-24')).toMatchObject({ llmMicroFlux: 1_000_000, ttsMicroFlux: 0 })
      expect(dayOf(shanghai, '2026-10-25')).toMatchObject({ llmMicroFlux: 2_000_000, ttsMicroFlux: 500_000 })
      expect(dayOf(shanghai, '2026-10-23')).toMatchObject({ llmMicroFlux: 0, ttsMicroFlux: 0, newSessionCount: 0 })
      expect(dayOf(utc, '2026-10-24')).toMatchObject({ llmMicroFlux: 3_000_000, ttsMicroFlux: 0 })
      expect(dayOf(utc, '2026-10-25')).toMatchObject({ llmMicroFlux: 0, ttsMicroFlux: 500_000 })
    })

    it('ignores other users, other source types, and fees before the window', async () => {
      await db.insert(schema.fluxUsage).values([
        usage('user-daily-scope', 'llm', 'in-window', 1_000_000, '2026-10-20T01:00:00Z'),
        usage('user-daily-scope', 'llm', 'too-old', 9_000_000, '2025-10-01T01:00:00Z'),
        usage('user-daily-scope', 'image', 'other-type', 9_000_000, '2026-10-20T01:00:00Z'),
        usage('user-daily-other', 'llm', 'other-user', 9_000_000, '2026-10-20T01:00:00Z'),
      ])

      const { days } = await service.getDailyUsage('user-daily-scope', 'UTC', now)

      expect(days.reduce((total, day) => total + day.llmMicroFlux, 0)).toBe(1_000_000)
    })

    it('counts a session once on the day of its first request and measures the longest session', async () => {
      await db.insert(schema.llmRequestLog).values([
        request('user-sessions', 'long', '2026-10-20T16:30:00Z'),
        request('user-sessions', 'long', '2026-10-21T16:30:00Z'),
        request('user-sessions', 'single', '2026-10-21T02:00:00Z'),
        request('user-sessions', null, '2026-10-21T03:00:00Z'),
        request('user-sessions', 'before-window', '2025-01-01T00:00:00Z'),
        request('user-sessions', 'before-window', '2026-10-22T00:00:00Z'),
        request('user-other', 'foreign', '2026-10-21T02:00:00Z'),
      ])

      const shanghai = await service.getDailyUsage('user-sessions', 'Asia/Shanghai', now)
      const utc = await service.getDailyUsage('user-sessions', 'UTC', now)
      const countsOf = (result: typeof shanghai) => result.days.filter(day => day.newSessionCount > 0).map(day => [day.date, day.newSessionCount])

      expect(countsOf(shanghai)).toEqual([['2026-10-21', 2]])
      expect(countsOf(utc)).toEqual([['2026-10-20', 1], ['2026-10-21', 1]])
      expect(shanghai.longestSessionMs).toBe(24 * 60 * 60 * 1000)
    })
  })
})
