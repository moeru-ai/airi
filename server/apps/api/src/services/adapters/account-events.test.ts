import { describe, expect, it, vi } from 'vitest'

import { createStreamPublisher } from '../../libs/redis/stream'
import { createTestRedis, readStreamFields } from '../../libs/tests/redis'
import { createUserDeletionService } from '../domain/user-deletion'
import { accountEventsStream, createUserDeletedEventHandler } from './account-events'

describe('accountEventsStream', () => {
  it('publishes the contract payloads at version 1 with the user ID in the payload', async () => {
    const redis = createTestRedis()
    const publisher = createStreamPublisher(redis, accountEventsStream)
    const occurredAt = new Date('2026-10-18T00:00:00.000Z')

    await publisher.publish('subscription.renewed', {
      id: 'revenuecat:evt-1',
      occurredAt,
      payload: { userId: 'user-1', plan: 'rc_go_monthly', periodEnd: '2026-11-18T00:00:00.000Z' },
    })
    await publisher.publish('subscription.payment_failed', {
      id: 'revenuecat:evt-2',
      occurredAt,
      payload: { userId: 'user-1', plan: 'rc_go_monthly' },
    })
    await publisher.publish('user.deleted', { id: 'user-deletion:user-1', occurredAt, payload: { userId: 'user-1' } })

    expect(await readStreamFields(redis, 'account-events')).toEqual([
      {
        id: 'revenuecat:evt-1',
        type: 'subscription.renewed',
        version: '1',
        occurredAt: '2026-10-18T00:00:00.000Z',
        payload: '{"userId":"user-1","plan":"rc_go_monthly","periodEnd":"2026-11-18T00:00:00.000Z"}',
      },
      {
        id: 'revenuecat:evt-2',
        type: 'subscription.payment_failed',
        version: '1',
        occurredAt: '2026-10-18T00:00:00.000Z',
        payload: '{"userId":"user-1","plan":"rc_go_monthly"}',
      },
      {
        id: 'user-deletion:user-1',
        type: 'user.deleted',
        version: '1',
        occurredAt: '2026-10-18T00:00:00.000Z',
        payload: '{"userId":"user-1"}',
      },
    ])
  })

  it('trims the stream approximately at 100000 entries', async () => {
    const redis = createTestRedis()
    const xadd = vi.spyOn(redis, 'xadd')

    await createStreamPublisher(redis, accountEventsStream).publish('user.deleted', { id: 'user-deletion:user-1', payload: { userId: 'user-1' } })

    expect(xadd.mock.calls[0]?.slice(0, 5)).toEqual(['account-events', 'MAXLEN', '~', 100_000, '*'])
  })

  it('rejects a payload without a user ID or with fields outside the contract', async () => {
    const redis = createTestRedis()
    const publisher = createStreamPublisher(redis, accountEventsStream)

    await expect(publisher.publish('user.deleted', { id: 'user-deletion:', payload: { userId: '' } })).rejects.toThrow()
    await expect(publisher.publish('subscription.payment_failed', {
      id: 'revenuecat:evt-3',
      payload: { userId: 'user-1', plan: 'rc_go_monthly', reason: 'card_declined' } as never,
    })).rejects.toThrow()

    expect(await readStreamFields(redis, 'account-events')).toEqual([])
  })
})

describe('createUserDeletedEventHandler', () => {
  it('publishes user.deleted after the soft-delete handlers', async () => {
    const redis = createTestRedis()
    const calls: string[] = []
    const service = createUserDeletionService()
    service.register(createUserDeletedEventHandler(createStreamPublisher(redis, accountEventsStream)))
    service.register({
      name: 'chats',
      priority: 30,
      softDelete: async () => {
        calls.push(`chats:${(await readStreamFields(redis, 'account-events')).length}`)
      },
    })

    await service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' })

    expect(calls).toEqual(['chats:0'])
    const [entry] = await readStreamFields(redis, 'account-events')
    expect(entry?.id).toBe('user-deletion:user-1')
    expect(entry?.type).toBe('user.deleted')
    expect(entry?.payload).toBe('{"userId":"user-1"}')
  })

  it('fails the deletion when the publish fails', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockRejectedValue(new Error('Connection is closed.'))
    const service = createUserDeletionService()
    service.register(createUserDeletedEventHandler(createStreamPublisher(redis, accountEventsStream)))

    await expect(service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' })).rejects.toThrow('Connection is closed.')
  })
})
