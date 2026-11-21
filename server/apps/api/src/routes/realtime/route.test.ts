import type { CallAccessService } from '../../services/domain/realtime-calls'
import type { HonoEnv } from '../../types/hono'

import { ApiError } from '@proj-airi/http-error-shared'
import { parseCallAccess } from '@proj-airi/server-sdk-shared/realtime'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createRealtimeRoutes } from '.'

function createTestApp(service: CallAccessService | null, user: { id: string } | null) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/v1/realtime', createRealtimeRoutes(service))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })
}

function createService() {
  return { grant: vi.fn(async () => ({ url: 'wss://livekit.example.com', token: 'token-1', room: 'room-1' })) }
}

function requestAccess(app: ReturnType<typeof createTestApp>, callId: string, body: unknown) {
  return app.request(`/api/v1/realtime/calls/${callId}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('realtime call access route', () => {
  it('requires a signed-in user', async () => {
    const service = createService()

    const res = await requestAccess(createTestApp(service, null), 'call-1', { deviceId: 'phone-1' })

    expect(res.status).toBe(401)
    expect(service.grant).not.toHaveBeenCalled()
  })

  it('answers 503 when the deployment has no media server', async () => {
    const res = await requestAccess(createTestApp(null, { id: 'user-1' }), 'call-1', { deviceId: 'phone-1' })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'REALTIME_CALLS_DISABLED' })
  })

  it('returns the access for the signed-in user, not for a user in the request', async () => {
    const service = createService()

    const res = await requestAccess(createTestApp(service, { id: 'user-1' }), 'call-1', { deviceId: 'phone-1', userId: 'user-2' })

    expect(res.status).toBe(201)
    expect(parseCallAccess(await res.json())).toEqual({ url: 'wss://livekit.example.com', token: 'token-1', room: 'room-1' })
    expect(service.grant).toHaveBeenCalledWith({ userId: 'user-1', callId: 'call-1', deviceId: 'phone-1' })
  })

  it.each([
    ['a call id with a separator of the room name', 'a:b', { deviceId: 'phone-1' }],
    ['a call id that is too long', 'c'.repeat(65), { deviceId: 'phone-1' }],
    ['a missing device id', 'call-1', {}],
    ['a device id with a space', 'call-1', { deviceId: 'phone 1' }],
    ['a body that is not JSON', 'call-1', 'not json'],
  ])('rejects %s', async (_name, callId, body) => {
    const service = createService()

    const res = await requestAccess(createTestApp(service, { id: 'user-1' }), callId, body)

    expect(res.status).toBe(400)
    expect(service.grant).not.toHaveBeenCalled()
  })
})
