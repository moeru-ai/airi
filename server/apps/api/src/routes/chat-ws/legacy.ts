import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'
import type { ChatWsRuntime } from './runtime'

import { useLogger } from '@guiiai/logg'
import { newMessages } from '@proj-airi/server-sdk-shared/v1'

import { nanoid } from '../../utils/id'
import { createLegacyChatWsHooks } from './legacy-adapter'
import { registerLegacyChatRpcHandlers } from './legacy-rpc'
import { createChatWsRuntime } from './runtime'

const log = useLogger('chat-ws:v1').useGlobalConfig()

/**
 * Creates the legacy `/ws/chat` handlers.
 *
 * The route keeps Eventa `0.3.0` and query-token authentication for clients
 * that shipped before `/ws/v2/chat`.
 */
export function createLegacyChatWsHandlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
) {
  const { registry, broadcast } = runtime ?? createChatWsRuntime(redis, instanceId, metrics)

  return function setupPeer(userId: string) {
    let connectionId: string | undefined

    return createLegacyChatWsHooks({
      onContext: (ctx) => {
        const currentConnectionId = nanoid()
        connectionId = currentConnectionId
        registry.add(userId, currentConnectionId, (payload) => {
          ctx.emit(newMessages, payload)
        })
        broadcast.ensureSubscribed(userId)
        log.withFields({ userId }).log('WS v1 connected')

        registerLegacyChatRpcHandlers({
          ctx,
          connectionId: currentConnectionId,
          userId,
          chatService,
          registry,
          broadcast,
          metrics,
        })
      },
      onDisconnected: () => {
        if (!connectionId)
          return
        registry.remove(userId, connectionId)
        broadcast.maybeUnsubscribe(userId)
        log.withFields({ userId }).log('WS v1 disconnected')
      },
    })
  }
}
