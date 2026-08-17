import type { WSContext, WSEvents } from 'hono/ws'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate } from '@proj-airi/server-sdk-shared/v2'
import * as v from 'valibot'

import { WS_CLOSE_UNAUTHORIZED } from '../../../libs/ws-auth'
import { registerChatWsPeer } from '../peer'
import { createChatWsRuntime } from '../runtime'

const chatAuthenticateRequestSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1)),
})
const CHAT_AUTH_TIMEOUT_MS = 15_000

export interface ChatWsAuthResolver {
  (token: string): Promise<string | null>
}

/**
 * Creates version-two WebSocket handlers for chat sync and message fanout.
 *
 * `/ws/v2/chat` accepts an anonymous WebSocket upgrade. The client must invoke
 * `chat:authenticate` before the timeout; only then does it join the shared
 * authenticated peer runtime.
 */
export function createChatWsV2Handlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  resolveUserId: ChatWsAuthResolver,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
) {
  const chatRuntime = runtime ?? createChatWsRuntime(redis, instanceId, metrics)

  return function setupPeer() {
    let socket: WSContext | undefined
    let authTimer: ReturnType<typeof setTimeout> | undefined

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        let userId: string | undefined
        const unregisterAuthenticate = defineInvokeHandler(ctx, authenticate, async (request) => {
          const parsed = v.safeParse(chatAuthenticateRequestSchema, request)
          if (!parsed.success) {
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
            throw new Error('WebSocket authentication failed')
          }

          const resolvedUserId = await resolveUserId(parsed.output.token)
          if (!resolvedUserId) {
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
            throw new Error('WebSocket authentication failed')
          }

          if (userId)
            return { userId }

          userId = resolvedUserId
          if (authTimer)
            clearTimeout(authTimer)
          registerChatWsPeer({ ctx, userId, chatService, runtime: chatRuntime, metrics })
          return { userId }
        })

        authTimer = setTimeout(() => {
          if (!userId)
            socket?.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
        }, CHAT_AUTH_TIMEOUT_MS)

        ctx.on(wsDisconnectedEvent, () => {
          if (authTimer)
            clearTimeout(authTimer)
          unregisterAuthenticate()
        })
      },
    })

    const originalOnOpen = hooks.onOpen
    const v2Hooks: WSEvents = {
      ...hooks,
      onOpen(event, ws) {
        socket = ws
        originalOnOpen?.(event, ws)
      },
    }
    return v2Hooks
  }
}
