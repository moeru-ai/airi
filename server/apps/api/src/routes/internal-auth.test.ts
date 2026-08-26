import { describe, expect, it, vi } from 'vitest'

import { createInternalAuthRoutes } from './internal-auth'

describe('internal auth routes', () => {
  it('rejects an invalid deletion contract before calling business services', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn() }
    const app = createInternalAuthRoutes({ productEventService, userDeletionService })

    const response = await app.request('/user-deletion', { body: '{}', method: 'POST' })

    expect(response.status).toBe(400)
    expect(userDeletionService.softDeleteAll).not.toHaveBeenCalled()
  })

  it('delegates private cleanup to the API-owned deletion workflow', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn(async () => undefined) }
    const productEventService = { track: vi.fn() }
    const app = createInternalAuthRoutes({ productEventService, userDeletionService })

    const response = await app.request('/user-deletion', {
      body: JSON.stringify({ reason: 'user-requested', userId: 'user-1' }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(userDeletionService.softDeleteAll).toHaveBeenCalledWith({
      reason: 'user-requested',
      userId: 'user-1',
    })
  })

  it('records private auth lifecycle events in the API-owned event service', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn(async () => undefined) }
    const app = createInternalAuthRoutes({
      productEventService,
      userDeletionService,
    })

    const response = await app.request('/events', {
      body: JSON.stringify({
        action: 'user_signed_up',
        source: 'better-auth.user.create',
        userId: 'user-1',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(productEventService.track).toHaveBeenCalledWith({
      action: 'user_signed_up',
      feature: 'auth',
      source: 'better-auth.user.create',
      status: 'succeeded',
      userId: 'user-1',
    })
  })
})
