import { describe, expect, it, vi } from 'vitest'

import { createMqWorker } from '../worker'

function createMessage() {
  return {
    streamMessageId: '1740000000000-0',
    event: {
      eventId: 'evt-1',
      eventType: 'flux.debited' as const,
      aggregateId: 'user-1',
      userId: 'user-1',
      requestId: 'req-1',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        amount: 5,
        balanceAfter: 95,
        source: 'llm',
      },
    },
  }
}

describe('mqWorker', () => {
  it('reclaims pending messages before reading new ones and acks after handling', async () => {
    const controller = new AbortController()
    const message = createMessage()

    const mq = {
      ensureConsumerGroup: vi.fn(async () => true),
      claimIdleMessages: vi.fn(async () => [message]),
      consume: vi.fn(async () => []),
      ack: vi.fn(async () => 1),
    }

    const worker = createMqWorker(mq as any)
    const handled: string[] = []

    await worker.run({
      group: 'billing',
      consumer: 'billing-1',
      signal: controller.signal,
      onMessage: vi.fn(async (incomingMessage) => {
        handled.push(incomingMessage.event.eventId)
        controller.abort()
      }),
    })

    expect(mq.ensureConsumerGroup).toHaveBeenCalledWith('billing')
    expect(mq.claimIdleMessages).toHaveBeenCalledWith({
      group: 'billing',
      consumer: 'billing-1',
      minIdleTimeMs: 30000,
      count: 10,
    })
    expect(mq.consume).not.toHaveBeenCalled()
    expect(mq.ack).toHaveBeenCalledWith('billing', '1740000000000-0')
    expect(handled).toEqual(['evt-1'])
  })

  it('reads new messages when there are no idle pending messages', async () => {
    const controller = new AbortController()
    const message = createMessage()

    const mq = {
      ensureConsumerGroup: vi.fn(async () => true),
      claimIdleMessages: vi.fn(async () => []),
      consume: vi.fn(async () => [message]),
      ack: vi.fn(async () => 1),
    }

    const worker = createMqWorker(mq as any)

    await worker.run({
      group: 'billing',
      consumer: 'billing-1',
      signal: controller.signal,
      batchSize: 5,
      blockMs: 250,
      minIdleTimeMs: 1000,
      onMessage: vi.fn(async () => {
        controller.abort()
      }),
    })

    expect(mq.consume).toHaveBeenCalledWith({
      group: 'billing',
      consumer: 'billing-1',
      count: 5,
      blockMs: 250,
    })
  })

  it('leaves failed messages pending by not acking them', async () => {
    const controller = new AbortController()

    const mq = {
      ensureConsumerGroup: vi.fn(async () => true),
      claimIdleMessages: vi.fn(async () => [createMessage()]),
      consume: vi.fn(async () => []),
      ack: vi.fn(async () => 1),
    }

    const worker = createMqWorker(mq as any)

    await worker.run({
      group: 'billing',
      consumer: 'billing-1',
      signal: controller.signal,
      onMessage: vi.fn(async () => {
        controller.abort()
        throw new Error('handler failed')
      }),
    })

    expect(mq.ack).not.toHaveBeenCalled()
  })
})
