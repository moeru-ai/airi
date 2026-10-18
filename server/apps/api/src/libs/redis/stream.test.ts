import { isoTimestamp, object, optional, pipe, string } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { createTestRedis, readStreamFields } from '../tests/redis'
import { createStreamPublisher, defineStream } from './stream'

const orderEvents = defineStream({
  key: 'test:order-events',
  maxLength: 500,
  events: {
    'order.paid': { version: 1, payload: object({ orderId: string(), paidAt: pipe(string(), isoTimestamp()) }) },
    'order.refunded': { version: 2, payload: object({ orderId: string(), note: optional(string()) }) },
  },
})

describe('defineStream', () => {
  it('rejects an invalid key, limit, or version when the stream is defined', () => {
    const payload = object({ orderId: string() })

    expect(() => defineStream({ key: '', maxLength: 1, events: {} })).toThrow()
    expect(() => defineStream({ key: 'test:stream', maxLength: 0, events: {} })).toThrow()
    expect(() => defineStream({ key: 'test:stream', maxLength: 1.5, events: {} })).toThrow()
    expect(() => defineStream({ key: 'test:stream', maxLength: 1, events: { 'order.paid': { version: 0, payload } } })).toThrow()
  })
})

describe('createStreamPublisher', () => {
  it('encodes the envelope with the version of the event type', async () => {
    const redis = createTestRedis()
    const publisher = createStreamPublisher(redis, orderEvents)

    const streamEntryId = await publisher.publish('order.paid', {
      id: 'order:1',
      occurredAt: new Date('2026-10-19T01:02:03.000Z'),
      payload: { orderId: 'o-1', paidAt: '2026-10-19T01:00:00.000Z' },
    })
    await publisher.publish('order.refunded', {
      id: 'order:2',
      occurredAt: new Date('2026-10-19T02:00:00.000Z'),
      payload: { orderId: 'o-1' },
    })

    expect(streamEntryId).toMatch(/^\d+-\d+$/)
    expect(await readStreamFields(redis, 'test:order-events')).toEqual([
      {
        id: 'order:1',
        type: 'order.paid',
        version: '1',
        occurredAt: '2026-10-19T01:02:03.000Z',
        payload: '{"orderId":"o-1","paidAt":"2026-10-19T01:00:00.000Z"}',
      },
      {
        id: 'order:2',
        type: 'order.refunded',
        version: '2',
        occurredAt: '2026-10-19T02:00:00.000Z',
        payload: '{"orderId":"o-1"}',
      },
    ])
  })

  it('trims approximately at the stream limit', async () => {
    const redis = createTestRedis()
    const xadd = vi.spyOn(redis, 'xadd')
    const publisher = createStreamPublisher(redis, orderEvents)

    await publisher.publish('order.refunded', {
      id: 'order:3',
      occurredAt: new Date('2026-10-19T00:00:00.000Z'),
      payload: { orderId: 'o-3', note: 'duplicate' },
    })

    expect(xadd).toHaveBeenCalledWith(
      'test:order-events',
      'MAXLEN',
      '~',
      500,
      '*',
      'id',
      'order:3',
      'type',
      'order.refunded',
      'version',
      '2',
      'occurredAt',
      '2026-10-19T00:00:00.000Z',
      'payload',
      '{"orderId":"o-3","note":"duplicate"}',
    )
  })

  it('sets occurredAt to the publish time when the producer omits it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-19T03:00:00.000Z') })
    try {
      const redis = createTestRedis()
      const publisher = createStreamPublisher(redis, orderEvents)

      await publisher.publish('order.refunded', { id: 'order:4', payload: { orderId: 'o-4' } })

      const [entry] = await readStreamFields(redis, 'test:order-events')
      expect(entry?.occurredAt).toBe('2026-10-19T03:00:00.000Z')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects invalid input without writing an entry', async () => {
    const redis = createTestRedis()
    const publisher = createStreamPublisher(redis, orderEvents)

    await expect(publisher.publish('order.refunded', { id: '', payload: { orderId: 'o-5' } })).rejects.toThrow()
    await expect(publisher.publish('order.refunded', { id: 'order:5', occurredAt: new Date(Number.NaN), payload: { orderId: 'o-5' } })).rejects.toThrow()
    await expect(publisher.publish('order.paid', { id: 'order:5', payload: { orderId: 'o-5', paidAt: 'yesterday' } })).rejects.toThrow()
    await expect(publisher.publish('order.shipped' as 'order.paid', { id: 'order:5', payload: { orderId: 'o-5', paidAt: '2026-10-19T00:00:00.000Z' } })).rejects.toThrow('Stream test:order-events has no event type order.shipped')

    expect(await readStreamFields(redis, 'test:order-events')).toEqual([])
  })

  it('propagates an XADD failure to the caller', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockRejectedValue(new Error('READONLY You cannot write against a read only replica.'))
    const publisher = createStreamPublisher(redis, orderEvents)

    await expect(publisher.publish('order.refunded', { id: 'order:6', payload: { orderId: 'o-6' } })).rejects.toThrow('READONLY')
  })

  it('rejects when XADD stores no entry', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockResolvedValue(null)
    const publisher = createStreamPublisher(redis, orderEvents)

    await expect(publisher.publish('order.refunded', { id: 'order:7', payload: { orderId: 'o-7' } })).rejects.toThrow('returned no stream entry ID')
  })
})
