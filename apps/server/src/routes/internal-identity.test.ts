import { describe, expect, it, vi } from 'vitest'

import { createInternalIdentityRoutes } from './internal-identity'

describe('internal identity routes', () => {
  it('rejects requests without the shared service credential', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn() }
    const app = createInternalIdentityRoutes({ secret: 'shared-secret', userDeletionService })

    const response = await app.request('/user-deletion', { method: 'POST', body: '{}' })

    expect(response.status).toBe(401)
    expect(userDeletionService.softDeleteAll).not.toHaveBeenCalled()
  })

  it('delegates authenticated cleanup to the API-owned deletion workflow', async () => {
    const userDeletionService = { register: vi.fn(), softDeleteAll: vi.fn(async () => undefined) }
    const app = createInternalIdentityRoutes({ secret: 'shared-secret', userDeletionService })

    const response = await app.request('/user-deletion', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer shared-secret',
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
})
