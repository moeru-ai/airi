import { describe, expect, it, vi } from 'vitest'

import { createTestRedis, readStreamFields } from '../../libs/tests/redis'
import { createUserDeletionService } from '../domain/user-deletion'
import { createAccountEventPublisher, createUserDeletedEventHandler } from './account-events'

describe('createAccountEventPublisher', () => {
  it('encodes subscription.renewed as flat contract fields', async () => {
    const redis = createTestRedis()
    const publisher = createAccountEventPublisher(redis)

    const streamMessageId = await publisher.publish({
      id: 'revenuecat:evt-1',
      type: 'subscription.renewed',
      userId: 'user-1',
      occurredAt: new Date('2026-10-18T01:02:03.000Z'),
      payload: { plan: 'rc_go_monthly', periodEnd: new Date('2026-11-18T01:02:03.000Z') },
    })

    expect(streamMessageId).toMatch(/^\d+-\d+$/)
    expect(await readStreamFields(redis, 'airi:account-events')).toEqual([{
      id: 'revenuecat:evt-1',
      type: 'subscription.renewed',
      userId: 'user-1',
      occurredAt: '2026-10-18T01:02:03.000Z',
      version: '1',
      payload: '{"plan":"rc_go_monthly","periodEnd":"2026-11-18T01:02:03.000Z"}',
    }])
  })

  it('omits an unset retryAt from subscription.payment_failed', async () => {
    const redis = createTestRedis()
    const publisher = createAccountEventPublisher(redis)

    await publisher.publish({
      id: 'revenuecat:evt-2',
      type: 'subscription.payment_failed',
      userId: 'user-1',
      occurredAt: new Date('2026-10-18T00:00:00.000Z'),
      payload: { plan: 'rc_go_monthly' },
    })

    const [entry] = await readStreamFields(redis, 'airi:account-events')
    expect(entry?.type).toBe('subscription.payment_failed')
    expect(entry?.payload).toBe('{"plan":"rc_go_monthly"}')
  })

  it('trims the stream approximately at 100000 entries', async () => {
    const redis = createTestRedis()
    const xadd = vi.spyOn(redis, 'xadd')
    const publisher = createAccountEventPublisher(redis)

    await publisher.publish({
      id: 'user-deletion:user-1',
      type: 'user.deleted',
      userId: 'user-1',
      occurredAt: new Date('2026-10-18T00:00:00.000Z'),
      payload: {},
    })

    expect(xadd).toHaveBeenCalledWith(
      'airi:account-events',
      'MAXLEN',
      '~',
      100_000,
      '*',
      'id',
      'user-deletion:user-1',
      'type',
      'user.deleted',
      'userId',
      'user-1',
      'occurredAt',
      '2026-10-18T00:00:00.000Z',
      'version',
      '1',
      'payload',
      '{}',
    )
  })

  it('rejects an event outside the contract without writing it', async () => {
    const redis = createTestRedis()
    const publisher = createAccountEventPublisher(redis)

    await expect(publisher.publish({
      id: 'evt-without-provider',
      type: 'subscription.renewed',
      userId: 'user-1',
      occurredAt: new Date(),
      payload: { plan: 'rc_go_monthly', periodEnd: new Date() },
    })).rejects.toThrow()
    await expect(publisher.publish({
      id: 'user-deletion:someone-else',
      type: 'user.deleted',
      userId: 'user-1',
      occurredAt: new Date(),
      payload: {},
    })).rejects.toThrow('user.deleted id must be user-deletion:<userId>')

    expect(await readStreamFields(redis, 'airi:account-events')).toEqual([])
  })

  it('propagates an XADD failure to the caller', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockRejectedValue(new Error('READONLY You cannot write against a read only replica.'))
    const publisher = createAccountEventPublisher(redis)

    await expect(publisher.publish({
      id: 'revenuecat:evt-3',
      type: 'subscription.payment_failed',
      userId: 'user-1',
      occurredAt: new Date(),
      payload: { plan: 'rc_go_monthly' },
    })).rejects.toThrow('READONLY')
  })

  it('rejects when XADD stores no entry', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockResolvedValue(null)
    const publisher = createAccountEventPublisher(redis)

    await expect(publisher.publish({
      id: 'user-deletion:user-1',
      type: 'user.deleted',
      userId: 'user-1',
      occurredAt: new Date(),
      payload: {},
    })).rejects.toThrow('returned no stream entry ID')
  })
})

describe('createUserDeletedEventHandler', () => {
  it('publishes user.deleted after the soft-delete handlers', async () => {
    const redis = createTestRedis()
    const calls: string[] = []
    const service = createUserDeletionService()
    service.register(createUserDeletedEventHandler(createAccountEventPublisher(redis)))
    service.register({
      name: 'chats',
      priority: 30,
      softDelete: async () => {
        calls.push(`chats:${(await readStreamFields(redis, 'airi:account-events')).length}`)
      },
    })

    await service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' })

    expect(calls).toEqual(['chats:0'])
    const [entry] = await readStreamFields(redis, 'airi:account-events')
    expect(entry?.id).toBe('user-deletion:user-1')
    expect(entry?.type).toBe('user.deleted')
    expect(entry?.userId).toBe('user-1')
    expect(entry?.payload).toBe('{}')
  })

  it('fails the deletion when the publish fails', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'xadd').mockRejectedValue(new Error('Connection is closed.'))
    const service = createUserDeletionService()
    service.register(createUserDeletedEventHandler(createAccountEventPublisher(redis)))

    await expect(service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' })).rejects.toThrow('Connection is closed.')
  })
})
