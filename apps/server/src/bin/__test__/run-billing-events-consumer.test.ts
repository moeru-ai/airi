import { describe, expect, it, vi } from 'vitest'

import { handleCacheSyncMessage } from '../run-billing-events-consumer'

describe('handleCacheSyncMessage', () => {
  it('updates the flux cache when a balance event includes balanceAfter', async () => {
    const redis = {
      set: vi.fn(async () => 'OK'),
    }

    await handleCacheSyncMessage({
      streamMessageId: '1740000000000-0',
      event: {
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
      },
    }, redis as any)

    expect(redis.set).toHaveBeenCalledWith('flux:user-1', '110')
  })

  it('ignores non-balance events', async () => {
    const redis = {
      set: vi.fn(async () => 'OK'),
    }

    await handleCacheSyncMessage({
      streamMessageId: '1740000000000-1',
      event: {
        eventId: 'evt-2',
        eventType: 'stripe.checkout.completed',
        aggregateId: 'sess-1',
        userId: 'user-1',
        requestId: 'req-2',
        occurredAt: '2026-03-24T00:00:00.000Z',
        schemaVersion: 1,
        payload: {
          stripeEventId: 'stripe-evt-1',
          stripeSessionId: 'sess-1',
          amount: 500,
          currency: 'usd',
        },
      },
    }, redis as any)

    expect(redis.set).not.toHaveBeenCalled()
  })
})
