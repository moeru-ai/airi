import type Redis from 'ioredis'

import type { StreamConsumerOptions, StreamHandlers } from './stream-consumer'

import process from 'node:process'

import IORedis from 'ioredis'

import { isoTimestamp, object, pipe, string } from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readStreamFields } from '../tests/redis'
import { createStreamGroupTestRedis } from '../tests/redis-stream-groups'
import { createStreamPublisher, defineStream } from './stream'
import { createStreamConsumer, InvalidStreamEntryError } from './stream-consumer'

const orderEvents = defineStream({
  key: 'test:consumer-orders',
  maxLength: 1000,
  events: {
    'order.paid': { version: 1, payload: object({ orderId: string(), paidAt: pipe(string(), isoTimestamp()) }) },
  },
})

type OrderEvents = typeof orderEvents.events

/** Short timings keep the claim and block paths inside one test. */
const fastOptions: StreamConsumerOptions = {
  group: 'test-group',
  consumer: 'consumer-1',
  deadLetterKey: 'test:consumer-orders:dead',
  claimMinIdleMs: 20,
  blockMs: 50,
}

const stops: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()))
})

async function startConsumer(redis: Redis, handlers: StreamHandlers<OrderEvents>, options: Partial<StreamConsumerOptions> = {}) {
  const consumer = createStreamConsumer(redis, orderEvents, handlers, { ...fastOptions, ...options })
  await consumer.start()
  stops.push(() => consumer.stop())
  return consumer
}

async function pendingIds(redis: Redis): Promise<string[]> {
  const reply = await redis.call('XPENDING', orderEvents.key, fastOptions.group, '-', '+', 100) as [string][]
  return reply.map(([id]) => id)
}

/** Counts XACK commands, so a test can wait until the consumer acked entries that leave no other trace. */
function ackCount(call: { mock: { calls: unknown[][] } }): number {
  return call.mock.calls.filter(([command]) => command === 'XACK').length
}

function publishPaid(redis: Redis, id: string) {
  return createStreamPublisher(redis, orderEvents).publish('order.paid', {
    id,
    occurredAt: new Date('2026-10-19T00:00:00.000Z'),
    payload: { orderId: id, paidAt: '2026-10-19T00:00:00.000Z' },
  })
}

describe('createStreamConsumer', () => {
  it('handles a published entry with the decoded payload and acks it', async () => {
    const redis = createStreamGroupTestRedis()
    const handled = vi.fn(async () => {})
    await startConsumer(redis, { 'order.paid': handled })

    const streamEntryId = await publishPaid(redis, 'order:1')

    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1))
    expect(handled).toHaveBeenCalledWith({
      streamEntryId,
      id: 'order:1',
      type: 'order.paid',
      version: 1,
      occurredAt: new Date('2026-10-19T00:00:00.000Z'),
      payload: { orderId: 'order:1', paidAt: '2026-10-19T00:00:00.000Z' },
    })
    await vi.waitFor(async () => expect(await pendingIds(redis)).toEqual([]))
  })

  it('creates the group at the stream end and tolerates an existing group', async () => {
    const redis = createStreamGroupTestRedis()
    await publishPaid(redis, 'order:before-group')
    const handled = vi.fn(async () => {})

    await startConsumer(redis, { 'order.paid': handled })
    const second = createStreamConsumer(redis, orderEvents, {}, { ...fastOptions, consumer: 'consumer-2' })
    await expect(second.start()).resolves.toBeUndefined()
    stops.push(() => second.stop())
    await publishPaid(redis, 'order:after-group')

    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1))
    expect(handled).toHaveBeenCalledWith(expect.objectContaining({ id: 'order:after-group' }))
  })

  it('dead-letters an entry with an invalid payload and acks it', async () => {
    const redis = createStreamGroupTestRedis()
    const handled = vi.fn(async () => {})
    await startConsumer(redis, { 'order.paid': handled })

    await redis.xadd(orderEvents.key, '*', 'id', 'order:2', 'type', 'order.paid', 'version', '1', 'occurredAt', '2026-10-19T00:00:00.000Z', 'payload', '{"orderId":"order:2"}')

    await vi.waitFor(async () => expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toHaveLength(1))
    const [deadLetter] = await readStreamFields(redis, fastOptions.deadLetterKey)
    expect(deadLetter?.id).toBe('order:2')
    expect(deadLetter?.payload).toBe('{"orderId":"order:2"}')
    expect(deadLetter?.reason).toMatch(/^invalid payload: /)
    expect(handled).not.toHaveBeenCalled()
    expect(await pendingIds(redis)).toEqual([])
  })

  it('dead-letters an entry with an invalid envelope', async () => {
    const redis = createStreamGroupTestRedis()
    await startConsumer(redis, { 'order.paid': async () => {} })

    await redis.xadd(orderEvents.key, '*', 'id', 'order:3', 'type', 'order.paid', 'version', 'one', 'occurredAt', 'yesterday', 'payload', '{}')

    await vi.waitFor(async () => expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toHaveLength(1))
    const [deadLetter] = await readStreamFields(redis, fastOptions.deadLetterKey)
    expect(deadLetter?.reason).toMatch(/^invalid envelope: /)
  })

  it('dead-letters an entry when the handler throws InvalidStreamEntryError', async () => {
    const redis = createStreamGroupTestRedis()
    await startConsumer(redis, {
      'order.paid': async () => {
        throw new InvalidStreamEntryError('order does not exist')
      },
    })

    await publishPaid(redis, 'order:4')

    await vi.waitFor(async () => expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toHaveLength(1))
    const [deadLetter] = await readStreamFields(redis, fastOptions.deadLetterKey)
    expect(deadLetter?.reason).toBe('order does not exist')
    expect(await pendingIds(redis)).toEqual([])
  })

  it('acks an unknown type or version without a handler call or a dead letter', async () => {
    const redis = createStreamGroupTestRedis()
    const handled = vi.fn(async () => {})
    const call = vi.spyOn(redis, 'call')
    await startConsumer(redis, { 'order.paid': handled })

    await redis.xadd(orderEvents.key, '*', 'id', 'order:5', 'type', 'order.shipped', 'version', '1', 'occurredAt', '2026-10-19T00:00:00.000Z', 'payload', '{}')
    await redis.xadd(orderEvents.key, '*', 'id', 'order:6', 'type', 'order.paid', 'version', '2', 'occurredAt', '2026-10-19T00:00:00.000Z', 'payload', '{}')

    await vi.waitFor(() => expect(ackCount(call)).toBe(2))
    expect(await pendingIds(redis)).toEqual([])
    expect(handled).not.toHaveBeenCalled()
    expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toEqual([])
  })

  it('acks a known type without a handler', async () => {
    const redis = createStreamGroupTestRedis()
    const call = vi.spyOn(redis, 'call')
    await startConsumer(redis, {})

    await publishPaid(redis, 'order:7')

    await vi.waitFor(() => expect(ackCount(call)).toBe(1))
    expect(await pendingIds(redis)).toEqual([])
    expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toEqual([])
  })

  it('keeps a failed entry pending and retries it after the claim idle time', async () => {
    const redis = createStreamGroupTestRedis()
    const handled = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined)
    // The idle time is long enough to see the entry pending before the claim retries it.
    await startConsumer(redis, { 'order.paid': handled }, { claimMinIdleMs: 300 })

    const streamEntryId = await publishPaid(redis, 'order:8')

    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1))
    expect(await pendingIds(redis)).toEqual([streamEntryId])
    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(2))
    await vi.waitFor(async () => expect(await pendingIds(redis)).toEqual([]))
    expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toEqual([])
  })

  it('dead-letters an entry delivered more than maxDeliveries times', async () => {
    const redis = createStreamGroupTestRedis()
    const handled = vi.fn(async () => {
      throw new Error('still failing')
    })
    await startConsumer(redis, { 'order.paid': handled }, { maxDeliveries: 2 })

    await publishPaid(redis, 'order:9')

    await vi.waitFor(async () => expect(await readStreamFields(redis, fastOptions.deadLetterKey)).toHaveLength(1))
    const [deadLetter] = await readStreamFields(redis, fastOptions.deadLetterKey)
    expect(deadLetter?.reason).toBe('delivered 3 times, more than 2')
    expect(handled).toHaveBeenCalledTimes(2)
    expect(await pendingIds(redis)).toEqual([])
  })

  it('lets the running handler finish and ack before stop resolves', async () => {
    const redis = createStreamGroupTestRedis()
    let finish: () => void = () => {}
    const started = vi.fn()
    const consumer = await startConsumer(redis, {
      'order.paid': async () => {
        started()
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      },
    })
    await publishPaid(redis, 'order:10')
    await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(1))

    const stopped = consumer.stop()
    finish()
    await stopped

    expect(await pendingIds(redis)).toEqual([])
  })

  it('interrupts a blocking read on stop', async () => {
    const redis = createStreamGroupTestRedis()
    const consumer = await startConsumer(redis, {}, { blockMs: 10_000 })
    await new Promise(resolve => setTimeout(resolve, 20))

    const startedAt = Date.now()
    await consumer.stop()

    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  it('rejects a second start', async () => {
    const redis = createStreamGroupTestRedis()
    const consumer = await startConsumer(redis, {})

    await expect(consumer.start()).rejects.toThrow('already started')
  })
})

// Real Redis covers the replies that the in-memory group commands only imitate.
describe.skipIf(!process.env.TEST_REDIS_URL)('createStreamConsumer with a real Redis', () => {
  it('round-trips, retries, and dead-letters entries', async () => {
    const redis = new IORedis(process.env.TEST_REDIS_URL!)
    const key = `test:stream-consumer:${Date.now()}`
    const stream = defineStream({ key, maxLength: 1000, events: orderEvents.events })
    const handled = vi.fn()
      .mockRejectedValueOnce(new Error('retry once'))
      .mockResolvedValue(undefined)
    const consumer = createStreamConsumer(redis, stream, { 'order.paid': handled }, { ...fastOptions, deadLetterKey: `${key}:dead` })
    try {
      await consumer.start()
      const publisher = createStreamPublisher(redis, stream)
      await publisher.publish('order.paid', { id: 'order:1', payload: { orderId: 'order:1', paidAt: '2026-10-19T00:00:00.000Z' } })
      await redis.xadd(key, '*', 'id', 'order:2', 'type', 'order.paid', 'version', '1', 'occurredAt', '2026-10-19T00:00:00.000Z', 'payload', '{}')

      await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(2), { timeout: 5000 })
      await vi.waitFor(async () => expect(await readStreamFields(redis, `${key}:dead`)).toHaveLength(1), { timeout: 5000 })
      await vi.waitFor(async () => expect(await redis.call('XPENDING', key, fastOptions.group, '-', '+', 10)).toEqual([]), { timeout: 5000 })
    }
    finally {
      await consumer.stop()
      await redis.del(key, `${key}:dead`)
      await redis.quit()
    }
  })
})
