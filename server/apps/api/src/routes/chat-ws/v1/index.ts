import type { HonoWsInvocableEventContext } from '@moeru/eventa-v1/adapters/websocket/hono'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { useLogger } from '@guiiai/logg'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa-v1/adapters/websocket/hono'
import { newMessages } from '@proj-airi/server-sdk-shared/v1'

import { nanoid } from '../../../utils/id'
import { createChatWsRuntime } from '../runtime'
import { registerChatWsV1RpcHandlers } from './rpc'

const log = useLogger('chat-ws:v1').useGlobalConfig()

/**
 * Creates the version-one `/ws/chat` handlers.
 *
 * The route keeps Eventa `1.0.0-beta.13` and query-token authentication for clients
 * that shipped before `/ws/v2/chat`.
 */
export function createChatWsV1Handlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
) {
  const { registry, broadcast } = runtime ?? createChatWsRuntime(redis, instanceId, metrics)

  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        registerPeer(ctx, userId)
      },
    })
    return hooks
  }

  function registerPeer(ctx: HonoWsInvocableEventContext, userId: string): void {
    const connectionId = nanoid()
    registry.add(userId, connectionId, (payload) => {
      void ctx.emit(newMessages, payload)
    })
    broadcast.ensureSubscribed(userId)
    log.withFields({ userId }).log('WS v1 connected')

    ctx.on(wsDisconnectedEvent, () => {
      registry.remove(userId, connectionId)
      broadcast.maybeUnsubscribe(userId)
      log.withFields({ userId }).log('WS v1 disconnected')
    })

    registerChatWsV1RpcHandlers({
      ctx,
      connectionId,
      userId,
      chatService,
      registry,
      broadcast,
      metrics,
    })
  }
}
