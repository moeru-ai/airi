import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'

import { createCallAccessService } from '.'

const config = { url: 'wss://livekit.example.com', apiKey: 'key-1', apiSecret: 'secret-that-is-long-enough-for-hs256' }

describe('call access service', () => {
  it('issues a token that joins the room of this user and call, and expires', async () => {
    const service = createCallAccessService(config)

    const access = await service.grant({ userId: 'user-1', callId: 'call-1', deviceId: 'phone-1' })

    expect(access.url).toBe('wss://livekit.example.com')
    expect(access.room).toBe('call_user-1_call-1')
    const { payload, protectedHeader } = await jwtVerify(access.token, new TextEncoder().encode(config.apiSecret), { issuer: 'key-1' })
    expect(protectedHeader.alg).toBe('HS256')
    expect(payload.sub).toBe('user-1_phone-1')
    expect(payload.video).toEqual({ room: 'call_user-1_call-1', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false })
    expect(payload.exp! - payload.nbf!).toBe(600)
  })

  it('puts the user id in the room name, so the same call id of another user is another room', async () => {
    const service = createCallAccessService(config)

    const first = await service.grant({ userId: 'user-1', callId: 'call-1', deviceId: 'phone-1' })
    const second = await service.grant({ userId: 'user-2', callId: 'call-1', deviceId: 'phone-1' })

    expect(first.room).not.toBe(second.room)
  })

  it('signs with the API secret', async () => {
    const access = await createCallAccessService(config).grant({ userId: 'user-1', callId: 'call-1', deviceId: 'phone-1' })

    await expect(jwtVerify(access.token, new TextEncoder().encode('another-secret-that-is-long-enough'))).rejects.toThrow()
  })
})
