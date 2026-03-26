import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createOutboxService } from '../outbox-service'

import * as schema from '../../schemas'

describe('outboxService', () => {
  let db: Database
  let outboxService: ReturnType<typeof createOutboxService>

  beforeAll(async () => {
    db = await mockDB(schema)
    outboxService = createOutboxService(db)
  })

  it('enqueues and claims unpublished events', async () => {
    await outboxService.enqueue(db, {
      eventId: 'evt-1',
      eventType: 'flux.credited',
      aggregateId: 'user-1',
      userId: 'user-1',
      requestId: 'req-1',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        amount: 10,
        balanceAfter: 110,
        source: 'stripe.checkout.completed',
      },
    })

    const claimed = await outboxService.claimPending({
      claimedBy: 'dispatcher-1',
      limit: 10,
      claimTtlMs: 30_000,
    })

    expect(claimed).toHaveLength(1)
    expect(claimed[0]?.event).toEqual({
      eventId: 'evt-1',
      eventType: 'flux.credited',
      aggregateId: 'user-1',
      userId: 'user-1',
      requestId: 'req-1',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        amount: 10,
        balanceAfter: 110,
        source: 'stripe.checkout.completed',
      },
    })
  })

  it('marks events as published and can release claims', async () => {
    await outboxService.enqueue(db, {
      eventId: 'evt-2',
      eventType: 'stripe.checkout.completed',
      aggregateId: 'sess-2',
      userId: 'user-2',
      requestId: 'req-2',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        stripeEventId: 'stripe-evt-2',
        stripeSessionId: 'sess-2',
        amount: 500,
        currency: 'usd',
      },
    })

    const [claimed] = await outboxService.claimPending({
      claimedBy: 'dispatcher-2',
      limit: 10,
      claimTtlMs: 30_000,
    })

    expect(claimed).toBeDefined()
    await outboxService.releaseClaim(claimed!.id)
    await outboxService.markPublished(claimed!.id, '1740000000000-0')

    const [published] = await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, claimed!.id))
    expect(published?.streamMessageId).toBe('1740000000000-0')
    expect(published?.publishedAt).toBeInstanceOf(Date)
    expect(published?.claimedBy).toBeNull()
  })
})
