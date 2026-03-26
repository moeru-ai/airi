import { describe, expect, it, vi } from 'vitest'

import { createOutboxDispatcher } from '../outbox-dispatcher'

describe('outboxDispatcher', () => {
  it('publishes claimed events and marks them as published', async () => {
    const outboxService = {
      claimPending: vi.fn(async () => ([
        {
          id: 'outbox-1',
          event: {
            eventId: 'evt-1',
            eventType: 'flux.credited' as const,
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
        },
      ])),
      markPublished: vi.fn(async () => {}),
      releaseClaim: vi.fn(async () => {}),
    }

    const billingMqService = {
      publish: vi.fn(async () => '1740000000000-0'),
    }

    const dispatcher = createOutboxDispatcher(outboxService as any, billingMqService as any)
    await expect(dispatcher.dispatchBatch('dispatcher-1', 10, 30_000)).resolves.toBe(1)

    expect(billingMqService.publish).toHaveBeenCalled()
    expect(outboxService.markPublished).toHaveBeenCalledWith('outbox-1', '1740000000000-0')
    expect(outboxService.releaseClaim).not.toHaveBeenCalled()
  })

  it('releases claims when publish fails', async () => {
    const outboxService = {
      claimPending: vi.fn(async () => ([
        {
          id: 'outbox-2',
          event: {
            eventId: 'evt-2',
            eventType: 'flux.credited' as const,
            aggregateId: 'user-2',
            userId: 'user-2',
            requestId: 'req-2',
            occurredAt: '2026-03-24T00:00:00.000Z',
            schemaVersion: 1,
            payload: {
              amount: 5,
              balanceAfter: 15,
              source: 'stripe.checkout.completed',
            },
          },
        },
      ])),
      markPublished: vi.fn(async () => {}),
      releaseClaim: vi.fn(async () => {}),
    }

    const billingMqService = {
      publish: vi.fn(async () => {
        throw new Error('redis down')
      }),
    }

    const dispatcher = createOutboxDispatcher(outboxService as any, billingMqService as any)
    await expect(dispatcher.dispatchBatch('dispatcher-2', 10, 30_000)).resolves.toBe(1)

    expect(outboxService.releaseClaim).toHaveBeenCalledWith('outbox-2')
    expect(outboxService.markPublished).not.toHaveBeenCalled()
  })
})
