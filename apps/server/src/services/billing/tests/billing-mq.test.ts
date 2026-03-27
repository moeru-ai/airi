import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_BILLING_EVENTS_STREAM } from '../../../utils/redis-keys'
import { createBillingMq } from '../billing-events'

function createEvent() {
  return {
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
      description: 'gpt-5',
      metadata: { promptTokens: 100, completionTokens: 200 },
    },
  }
}

describe('billingMqService', () => {
  it('publishes an event to the configured stream', async () => {
    const redis = {
      call: vi.fn(async () => '1740000000000-0'),
    }

    const mq = createBillingMq(redis, {
      stream: 'billing-events-test',
      maxLength: 1_000,
    })

    await expect(mq.publish(createEvent())).resolves.toBe('1740000000000-0')
    expect(redis.call).toHaveBeenCalledWith(
      'XADD',
      'billing-events-test',
      'MAXLEN',
      '~',
      1000,
      '*',
      'event_id',
      'evt-1',
      'event_type',
      'flux.debited',
      'aggregate_id',
      'user-1',
      'user_id',
      'user-1',
      'request_id',
      'req-1',
      'occurred_at',
      '2026-03-24T00:00:00.000Z',
      'schema_version',
      '1',
      'payload',
      JSON.stringify({
        amount: 5,
        balanceAfter: 95,
        source: 'llm',
        description: 'gpt-5',
        metadata: { promptTokens: 100, completionTokens: 200 },
      }),
    )
  })

  it('throws when publish does not return a stream message id', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => 123),
    })

    await expect(mq.publish(createEvent())).rejects.toThrow('Redis XADD did not return a stream message id')
  })

  it('creates a consumer group and returns true when the group is new', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => 'OK'),
    })

    await expect(mq.ensureConsumerGroup('billing')).resolves.toBe(true)
  })

  it('returns false when the consumer group already exists', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => {
        throw new Error('BUSYGROUP Consumer Group name already exists')
      }),
    })

    await expect(mq.ensureConsumerGroup('billing')).resolves.toBe(false)
  })

  it('rethrows non-BUSYGROUP errors when creating a consumer group', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => {
        throw new Error('NOAUTH')
      }),
    })

    await expect(mq.ensureConsumerGroup('billing')).rejects.toThrow('NOAUTH')
  })

  it('consumes stream entries from a consumer group', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => [[
        DEFAULT_BILLING_EVENTS_STREAM,
        [[
          '1740000000000-0',
          [
            'event_id',
            'evt-1',
            'event_type',
            'flux.debited',
            'aggregate_id',
            'user-1',
            'user_id',
            'user-1',
            'request_id',
            'req-1',
            'occurred_at',
            '2026-03-24T00:00:00.000Z',
            'schema_version',
            '1',
            'payload',
            JSON.stringify({
              amount: 5,
              balanceAfter: 95,
              source: 'llm',
              description: 'gpt-5',
              metadata: { promptTokens: 100, completionTokens: 200 },
            }),
          ],
        ]],
      ]]),
    })

    await expect(mq.consume({
      group: 'billing',
      consumer: 'consumer-1',
      count: 20,
      blockMs: 100,
    })).resolves.toEqual([{
      streamMessageId: '1740000000000-0',
      event: createEvent(),
    }])
  })

  it('returns an empty array when no messages are available', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => null),
    })

    await expect(mq.consume({
      group: 'billing',
      consumer: 'consumer-1',
    })).resolves.toEqual([])
  })

  it('throws when xreadgroup returns an invalid payload', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => ['not-an-array-entry']),
    })

    await expect(mq.consume({
      group: 'billing',
      consumer: 'consumer-1',
    })).rejects.toThrow('Redis XREADGROUP returned an invalid stream payload')
  })

  it('claims idle pending messages', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => [
        '1740000000001-0',
        [[
          '1740000000000-0',
          [
            'event_id',
            'evt-1',
            'event_type',
            'flux.debited',
            'aggregate_id',
            'user-1',
            'user_id',
            'user-1',
            'request_id',
            'req-1',
            'occurred_at',
            '2026-03-24T00:00:00.000Z',
            'schema_version',
            '1',
            'payload',
            JSON.stringify({
              amount: 5,
              balanceAfter: 95,
              source: 'llm',
              description: 'gpt-5',
              metadata: { promptTokens: 100, completionTokens: 200 },
            }),
          ],
        ]],
        [],
      ]),
    })

    await expect(mq.claimIdleMessages({
      group: 'billing',
      consumer: 'consumer-1',
      minIdleTimeMs: 30_000,
    })).resolves.toEqual([{
      streamMessageId: '1740000000000-0',
      event: createEvent(),
    }])
  })

  it('throws when xautoclaim returns an invalid payload', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => ['1740000000001-0']),
    })

    await expect(mq.claimIdleMessages({
      group: 'billing',
      consumer: 'consumer-1',
      minIdleTimeMs: 30_000,
    })).rejects.toThrow('Redis XAUTOCLAIM returned an invalid response')
  })

  it('acks one or more stream messages', async () => {
    const redis = {
      call: vi.fn(async () => 2),
    }

    const mq = createBillingMq(redis)
    await expect(mq.ack('billing', ['1-0', '2-0'])).resolves.toBe(2)
    expect(redis.call).toHaveBeenCalledWith('XACK', DEFAULT_BILLING_EVENTS_STREAM, 'billing', '1-0', '2-0')
  })

  it('returns zero when ack receives an empty message id list', async () => {
    const redis = {
      call: vi.fn(),
    }

    const mq = createBillingMq(redis)
    await expect(mq.ack('billing', [])).resolves.toBe(0)
    expect(redis.call).not.toHaveBeenCalled()
  })

  it('throws when ack does not return a number', async () => {
    const mq = createBillingMq({
      call: vi.fn(async () => '2'),
    })

    await expect(mq.ack('billing', '1-0')).rejects.toThrow('Redis XACK did not return an acknowledgement count')
  })
})
