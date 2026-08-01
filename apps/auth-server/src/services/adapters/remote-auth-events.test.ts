import { describe, expect, it, vi } from 'vitest'

import { createRemoteAuthEventService } from './remote-auth-events'

describe('remote auth event service', () => {
  it('forwards the bounded auth event contract to the resource API', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const service = createRemoteAuthEventService({
      RESOURCE_SERVER_URL: 'https://resource.internal',
      AUTH_INTERNAL_SECRET: 'shared-secret',
    }, fetchRequest)

    await service.track({
      userId: 'user-1',
      action: 'user_signed_up',
      source: 'better-auth.user.create',
    })

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://resource.internal/internal/auth/events')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'Authorization': 'Bearer shared-secret',
      'Content-Type': 'application/json',
    })
    expect(init?.body).toBe('{"userId":"user-1","action":"user_signed_up","source":"better-auth.user.create"}')
  })
})
