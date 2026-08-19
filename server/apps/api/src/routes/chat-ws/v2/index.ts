import type { WSContext, WSEvents } from 'hono/ws'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'
import type { ChatWsAuthResolver } from './auth'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate } from '@proj-airi/server-sdk-shared/v2'

import { registerChatWsPeer } from '../peer'
import { createChatWsRuntime } from '../runtime'
import { createChatWsV2Authentication } from './auth'

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
) {
  const chatRuntime = runtime ?? createChatWsRuntime(redis, instanceId, metrics)

  return function setupPeer() {
    let socket: WSContext | undefined

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        const authentication = createChatWsV2Authentication({
          socket,
          resolveUserId,
          onAuthenticated(userId) {
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
