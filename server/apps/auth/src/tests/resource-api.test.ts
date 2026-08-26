import { describe, expect, it, vi } from 'vitest'

import { createResourceApi } from '../resource-api'

describe('resource API', () => {
  it('forwards business-data deletion over the private HTTP boundary', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const resourceApi = createResourceApi('https://resource.internal', fetchRequest)

    await resourceApi.softDeleteUserData({ reason: 'user-requested', userId: 'user-1' })

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://resource.internal/internal/auth/user-deletion')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.body).toBe('{"userId":"user-1","reason":"user-requested"}')
  })

  it('fails account deletion when the resource API rejects cleanup', async () => {
    const resourceApi = createResourceApi(
      'https://resource.internal',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })),
    )

    await expect(
      resourceApi.softDeleteUserData({ reason: 'user-requested', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it('forwards auth events without adding an application credential', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const resourceApi = createResourceApi('https://resource.internal', fetchRequest)

    await resourceApi.trackAuthEvent({
      action: 'user_signed_up',
      source: 'better-auth.user.create',
      userId: 'user-1',
    })

    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://resource.internal/internal/auth/events')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.body).toBe('{"userId":"user-1","action":"user_signed_up","source":"better-auth.user.create"}')
  })
})
