import { describe, expect, it, vi } from 'vitest'

import { createInternalAuthRoutes } from './internal-auth'

describe('internal auth routes', () => {
  it('rejects an invalid deletion contract before calling business services', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn() }
    const app = createInternalAuthRoutes({ userDeletionService, productEventService })

    const response = await app.request('/user-deletion', { method: 'POST', body: '{}' })

    expect(response.status).toBe(400)
    expect(userDeletionService.softDeleteAll).not.toHaveBeenCalled()
  })

  it('delegates private cleanup to the API-owned deletion workflow', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn(async () => undefined) }
    const productEventService = { track: vi.fn() }
    const app = createInternalAuthRoutes({ userDeletionService, productEventService })

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

  it('records private auth lifecycle events in the API-owned event service', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const productEventService = { track: vi.fn(async () => undefined) }
    const app = createInternalAuthRoutes({
      userDeletionService,
      productEventService,
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
})
