import type { WSContext } from 'hono/ws'

import { parseAuthenticateRequest } from '@proj-airi/server-sdk-shared/v2'

import { WS_CLOSE_INTERNAL_ERROR, WS_CLOSE_TRY_AGAIN_LATER, WS_CLOSE_UNAUTHORIZED } from '../../../libs/ws-auth'

const CHAT_AUTH_TIMEOUT_MS = 15_000

export interface ChatWsAuthResolver {
  (token: string): Promise<string | null>
}

interface CreateChatWsV2AuthenticationOptions {
  socket?: Pick<WSContext, 'close'>
  resolveUserId: ChatWsAuthResolver
  onAuthenticated: (userId: string) => void
}

export interface ChatWsV2Authentication {
  /** Handles the only authentication request accepted for this socket. */
  authenticate: (request: unknown) => Promise<{ userId: string }>
  /** Stops authentication when the websocket disconnects. */
  disconnect: () => void
}

/**
 * Owns authentication lifetime for one version-two websocket connection.
 *
 * The session timer begins when the socket opens. A close or timeout marks the
 * session inactive before the token resolver completes, preventing a late
 * resolver result from registering a disconnected peer.
 */
export function createChatWsV2Authentication(options: CreateChatWsV2AuthenticationOptions): ChatWsV2Authentication {
  let authenticationStarted = false
  let connectionActive = true
  let authenticationComplete = false
  let authTimer: ReturnType<typeof setTimeout>

  function stopAuthentication(code: number, reason: string): void {
    connectionActive = false
    clearTimeout(authTimer)
    options.socket?.close(code, reason)
  }

  authTimer = setTimeout(() => {
    if (!authenticationComplete)
      stopAuthentication(WS_CLOSE_TRY_AGAIN_LATER, 'authentication timeout')
  }, CHAT_AUTH_TIMEOUT_MS)

  return {
    async authenticate(request) {
      if (authenticationStarted)
        throw new Error('WebSocket authentication already attempted')

      authenticationStarted = true

      let parsedRequest
      try {
        parsedRequest = parseAuthenticateRequest(request)
      }
      catch {
        stopAuthentication(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
        throw new Error('WebSocket authentication failed')
      }

      let userId: string | null
      try {
        userId = await options.resolveUserId(parsedRequest.token)
      }
      catch (error) {
        if (connectionActive)
          stopAuthentication(WS_CLOSE_INTERNAL_ERROR, 'authentication unavailable')
        throw error
      }

      if (!connectionActive)
        throw new Error('WebSocket closed during authentication')

      if (!userId) {
        stopAuthentication(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
        throw new Error('WebSocket authentication failed')
      }

      authenticationComplete = true
      clearTimeout(authTimer)
      options.onAuthenticated(userId)
      return { userId }
    },
    disconnect() {
      connectionActive = false
      clearTimeout(authTimer)
    },
  }
}
