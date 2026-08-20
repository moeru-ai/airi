import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { createPeerHooks } from '@moeru/eventa/adapters/websocket/hono'

import { registerChatWsPeer } from '../peer'
import { createChatWsRuntime } from '../runtime'

/**
 * Creates websocket handlers for chat sync RPC and message fanout.
 *
 * Use when:
 * - Mounting an already authenticated chat peer.
 *
 * Expects:
 * - `instanceId` is stable for this process so Redis echo suppression works.
 * - Redis Pub/Sub is used only for best-effort cross-instance notification.
 *
 * Returns:
 * - A per-user Hono websocket setup function.
 */
export function createChatWsV2Handlers(
  chatService: ChatService,
  redis: Redis,
  instanceId: string,
  metrics?: EngagementMetrics | null,
  runtime?: ChatWsRuntime,
) {
  const chatRuntime = runtime ?? createChatWsRuntime(redis, instanceId, metrics)

  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        registerChatWsPeer({ ctx, userId, chatService, runtime: chatRuntime, metrics })
      },
    })
    return hooks
  }
}
