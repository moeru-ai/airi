import { describe, expect, it, vi } from 'vitest'

import { createRemoteUserDeletionService } from './remote-user-deletion'

describe('remote user deletion service', () => {
  it('authenticates the Auth request and forwards the deletion contract', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const service = createRemoteUserDeletionService({
      RESOURCE_SERVER_URL: 'https://resource.internal',
      AUTH_INTERNAL_SECRET: 'shared-secret',
    }, fetchRequest)

    await service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' })

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://resource.internal/internal/auth/user-deletion')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      'Authorization': 'Bearer shared-secret',
      'Content-Type': 'application/json',
    })
    expect(init?.body).toBe('{"userId":"user-1","reason":"user-requested"}')
  })

  it('fails closed when the shared credential is missing', async () => {
    const service = createRemoteUserDeletionService({
      RESOURCE_SERVER_URL: 'https://resource.internal',
      AUTH_INTERNAL_SECRET: '',
    })

    await expect(
      service.softDeleteAll({ userId: 'user-1', reason: 'user-requested' }),
    ).rejects.toMatchObject({ statusCode: 503 })
  })
})
