import type { CallAccess } from '@proj-airi/server-sdk-shared/realtime'

import { SignJWT } from 'jose'

/** A device uses its token to join. The media server renews the token of a connected participant. */
const TOKEN_TTL_SECONDS = 600

export interface CallAccessConfig {
  /** The WebSocket URL that clients connect to. */
  url: string
  apiKey: string
  apiSecret: string
}

export interface CallAccessService {
  /** Issues access to the media room of one call of `userId`. The caller validates `callId` and `deviceId`. */
  grant: (input: { userId: string, callId: string, deviceId: string }) => Promise<CallAccess>
}

/**
 * Issues LiveKit access tokens for calls between the devices of one user.
 *
 * The room name contains the user id, and a token names one room. A user therefore cannot join a room of another
 * user, also when the user knows its call id.
 *
 * The token is the JWT that `AccessToken.toJwt` of `livekit-server-sdk` 2.19 builds: HS256 with the API secret,
 * `iss` is the API key, `sub` is the participant identity, and `video` holds the room grant.
 */
export function createCallAccessService(config: CallAccessConfig): CallAccessService {
  const secret = new TextEncoder().encode(config.apiSecret)

  return {
    async grant({ userId, callId, deviceId }) {
      const room = `call_${userId}_${callId}`
      const token = await new SignJWT({
        video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(config.apiKey)
        // One participant for each device. A second join with the same identity replaces the first.
        .setSubject(`${userId}_${deviceId}`)
        .setNotBefore(new Date())
        .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
        .sign(secret)

      return { url: config.url, token, room }
    },
  }
}
