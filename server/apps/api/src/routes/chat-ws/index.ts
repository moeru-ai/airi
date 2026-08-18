import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'

import { useLogger } from '@guiiai/logg'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'

import { createChatBroadcastCoordinator } from './broadcast'
import { createChatConnectionRegistry } from './connection-registry'
import { registerChatRpcHandlers } from './rpc'

const log = useLogger('chat-ws').useGlobalConfig()

/**
 * Creates websocket handlers for chat sync RPC and message fanout.
 *
 * Use when:
 * - Mounting `/ws/chat` after bearer-token auth has resolved a user id.
 *
 * Expects:
 * - `instanceId` is stable for this process so Redis echo suppression works.
 * - Redis Pub/Sub is used only for best-effort cross-instance notification.
 *
 * Returns:
 * - A per-user Hono websocket setup function.
 */
export function createChatWsHandlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  metrics?: EngagementMetrics | null,
) {
  const registry = createChatConnectionRegistry()
  const broadcast = createChatBroadcastCoordinator({ redis, registry, instanceId })

  // Pull-based active-connection gauge: walk the local registry on each
  // export interval and report the actual live count. Registered exactly
  // once per process here (factory runs once via injeca); duplicate
  // registration would double-count.
  metrics?.wsConnectionsActive.addCallback((result) => {
    result.observe(registry.activeCount())
  })

  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        registry.add(userId, ctx)
        broadcast.ensureSubscribed(userId)
        log.withFields({ userId }).log('WS connected')

        ctx.on(wsDisconnectedEvent, () => {
          registry.remove(userId, ctx)
          broadcast.maybeUnsubscribe(userId)
          log.withFields({ userId }).log('WS disconnected')
        })

        registerChatRpcHandlers({
          ctx,
          userId,
          chatService,
          registry,
          broadcast,
          metrics,
        })
      },
    })
    return hooks
  }
}
