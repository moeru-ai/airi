import { useLogger } from '@guiiai/logg'
import { ApiError, createErrorHandler } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStreamPublisher } from '../libs/redis/stream'
import { createTestRedis, readStreamFields } from '../libs/tests/redis'
import { accountEventsStream, createUserDeletedEventHandler } from '../services/adapters/account-events'
import { createUserDeletionService } from '../services/domain/user-deletion'
import { createInternalAuthRoutes } from './internal-auth'

describe('internal auth routes', () => {
  it('rejects an invalid deletion contract before calling business services', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn() }
    const revenuecatSubscriber = { hasRenewingSubscription: vi.fn(async () => false) }
    const app = new Hono()
      .onError(createErrorHandler(useLogger('test')))
      .route('/', createInternalAuthRoutes({ userDeletionService, productEventService, revenuecatSubscriber }))

    const response = await app.request('/user-deletion', { method: 'POST', body: '{}' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'BAD_REQUEST', message: 'Invalid user deletion request' })
    expect(userDeletionService.softDeleteAll).not.toHaveBeenCalled()
  })

  it('delegates private cleanup to the API-owned deletion workflow', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn(async () => undefined) }
    const productEventService = { track: vi.fn() }
    const revenuecatSubscriber = { hasRenewingSubscription: vi.fn(async () => false) }
    const app = createInternalAuthRoutes({ userDeletionService, productEventService, revenuecatSubscriber })

    const response = await app.request('/user-deletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-1', reason: 'user-requested' }),
    })

    expect(response.status).toBe(200)
    expect(userDeletionService.softDeleteAll).toHaveBeenCalledWith({
      userId: 'user-1',
      reason: 'user-requested',
    })
  })

  describe('user.deleted account event', () => {
    function deletionApp(redis: ReturnType<typeof createTestRedis>) {
      const userDeletionService = createUserDeletionService()
      userDeletionService.register(createUserDeletedEventHandler(createStreamPublisher(redis, accountEventsStream)))
      return new Hono()
        .onError(createErrorHandler(useLogger('test')))
        .route('/', createInternalAuthRoutes({
          userDeletionService,
          productEventService: { track: vi.fn() },
          revenuecatSubscriber: { hasRenewingSubscription: vi.fn(async () => false) },
        }))
    }

    function requestDeletion(app: ReturnType<typeof deletionApp>) {
      return app.request('/user-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1', reason: 'user-requested' }),
      })
    }

    it('publishes user.deleted before it confirms the deletion', async () => {
      const redis = createTestRedis()

      const response = await requestDeletion(deletionApp(redis))

      expect(response.status).toBe(200)
      expect((await readStreamFields(redis, 'account-events')).map(event => event.id)).toEqual(['user-deletion:user-1'])
    })

    it('fails the deletion when the publish fails, so Auth retries it', async () => {
      const redis = createTestRedis()
      vi.spyOn(redis, 'xadd').mockRejectedValueOnce(new Error('Connection is closed.'))

      const response = await requestDeletion(deletionApp(redis))

      expect(response.status).toBe(500)
      expect(await readStreamFields(redis, 'account-events')).toEqual([])
    })
  })

  it('records private auth lifecycle events in the API-owned event service', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn(async () => undefined) }
    const revenuecatSubscriber = { hasRenewingSubscription: vi.fn(async () => false) }
    const app = createInternalAuthRoutes({
      userDeletionService,
      productEventService,
      revenuecatSubscriber,
    })

    const response = await app.request('/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'user-1',
        action: 'user_signed_up',
        source: 'better-auth.user.create',
      }),
    })

    expect(response.status).toBe(200)
    expect(productEventService.track).toHaveBeenCalledWith({
      userId: 'user-1',
      feature: 'auth',
      action: 'user_signed_up',
      status: 'succeeded',
      source: 'better-auth.user.create',
    })
  })

  describe('deletion check', () => {
    function checkApp(renewing: boolean) {
      const revenuecatSubscriber = { hasRenewingSubscription: vi.fn(async () => renewing) }
      const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
      const app = new Hono()
        .onError((error, c) => error instanceof ApiError ? c.json({ error: error.errorCode }, error.statusCode) : c.json({}, 500))
        .route('/', createInternalAuthRoutes({ userDeletionService, productEventService: { track: vi.fn() }, revenuecatSubscriber }))
      const check = () => app.request('/user-deletion/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1' }),
      })
      return { check, revenuecatSubscriber, userDeletionService }
    }

    it('accepts a user without a subscription that can still charge', async () => {
      const { check, revenuecatSubscriber } = checkApp(false)

      const response = await check()

      expect(response.status).toBe(200)
      expect(revenuecatSubscriber.hasRenewingSubscription).toHaveBeenCalledWith('user-1')
    })

    it('refuses with 409 and deletes nothing while a subscription can still charge', async () => {
      const { check, userDeletionService } = checkApp(true)

      const response = await check()

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: 'SUBSCRIPTION_ACTIVE' })
      expect(userDeletionService.softDeleteAll).not.toHaveBeenCalled()
    })
  })
})
