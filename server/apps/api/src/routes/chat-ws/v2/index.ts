import type { WSContext, WSEvents } from 'hono/ws'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'
import type { ChatWsAuthResolver } from './auth'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate } from '@proj-airi/server-sdk-shared/v2'

import { WS_CLOSE_TRY_AGAIN_LATER, WS_CLOSE_UNAUTHORIZED } from '../../../libs/ws-auth'
import { registerChatWsPeer } from '../peer'
import { createChatWsRuntime } from '../runtime'
import { createChatWsV2Authentication } from './auth'
import { createChatWsUnauthenticatedPeerLimit } from './unauthenticated-peers'

const MAX_UNAUTHENTICATED_CHAT_WS_CONNECTIONS = 100
const MAX_UNAUTHENTICATED_CHAT_WS_FRAME_BYTES = 8192

function isTerminableSocket(raw: unknown): raw is { terminate: () => void } {
  return typeof raw === 'object'
    && raw !== null
    && 'terminate' in raw
    && typeof raw.terminate === 'function'
}

function isAuthenticateFrame(data: unknown): boolean {
  if (typeof data !== 'string' || data.length > MAX_UNAUTHENTICATED_CHAT_WS_FRAME_BYTES)
    return false

  try {
    const frame = JSON.parse(data) as { eventa?: { id?: unknown }, payload?: { id?: unknown } }
    return frame.eventa?.id === 'chat:authenticate-send'
      || frame.payload?.id === 'chat:authenticate-send'
  }
  catch {
    return false
  }
}

/**
 * Creates version-two WebSocket handlers for chat sync and message fanout.
 *
 * `/ws/v2/chat` accepts an anonymous WebSocket upgrade. The client must invoke
 * `chat:authenticate` before it joins the shared authenticated peer runtime.
 */
export function createChatWsV2Handlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  resolveUserId: ChatWsAuthResolver,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
  restoreAuthenticatedPayloadLimit?: (socket: unknown) => void,
) {
  const chatRuntime = runtime ?? createChatWsRuntime(redis, instanceId, metrics)
  // The v2 upgrade is anonymous by design. Keep a bounded number of peers in
  // the authentication window so a burst cannot retain unbounded timers and
  // Eventa contexts in this process.
  const unauthenticatedPeers = createChatWsUnauthenticatedPeerLimit(MAX_UNAUTHENTICATED_CHAT_WS_CONNECTIONS)

  return function setupPeer() {
    let socket: WSContext | undefined
    let ownsUnauthenticatedSlot = false
    let authenticated = false

    function releaseUnauthenticatedSlot(): void {
      if (!ownsUnauthenticatedSlot)
        return

      ownsUnauthenticatedSlot = false
      unauthenticatedPeers.release()
    }

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        const authentication = createChatWsV2Authentication({
          socket,
          resolveUserId,
          onAuthenticated(userId) {
            if (socket)
              restoreAuthenticatedPayloadLimit?.(socket.raw)
            authenticated = true
            releaseUnauthenticatedSlot()
            registerChatWsPeer({ ctx, userId, chatService, runtime: chatRuntime, metrics })
          },
        })
        const unregisterAuthenticate = defineInvokeHandler(ctx, authenticate, authentication.authenticate)

        ctx.on(wsDisconnectedEvent, () => {
          authentication.disconnect()
          unregisterAuthenticate()
        })
      },
    })

    const originalOnOpen = hooks.onOpen
    const originalOnClose = hooks.onClose
    const originalOnError = hooks.onError
    const originalOnMessage = hooks.onMessage
    const v2Hooks: WSEvents = {
      ...hooks,
      onOpen(event, ws) {
        if (!unauthenticatedPeers.tryAcquire()) {
          // Do not wait for a hostile peer to answer a close frame. The slot is
          // full, so terminating releases this connection immediately.
          if (isTerminableSocket(ws.raw))
            ws.raw.terminate()
          else
            ws.close(WS_CLOSE_TRY_AGAIN_LATER, 'too many unauthenticated connections')
          return
        }

        ownsUnauthenticatedSlot = true
        socket = ws
        originalOnOpen?.(event, ws)
      },
      onClose(event, ws) {
        releaseUnauthenticatedSlot()
        originalOnClose?.(event, ws)
      },
      onError(event, ws) {
        releaseUnauthenticatedSlot()
        originalOnError?.(event, ws)
      },
      onMessage(event, ws) {
        // Before authentication, accept one bounded Eventa invoke only. This
        // prevents arbitrary frames from reaching the adapter parser and log.
        if (!authenticated && !isAuthenticateFrame(event.data)) {
          ws.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
          return
        }

        originalOnMessage?.(event, ws)
      },
    }
    return v2Hooks
  }
}
