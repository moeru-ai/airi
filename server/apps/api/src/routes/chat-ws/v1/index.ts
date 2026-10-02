import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { createPeerHooks } from '@moeru/eventa/adapters/websocket/hono'

import { registerChatWsPeer } from '../peer'
import { createChatWsRuntime } from '../runtime'

/**
 * Creates the version-one `/ws/chat` handlers.
 *
 * The route keeps query-token authentication for deployed clients. Eventa
 * `1.0.0-beta.15` accepts their beta.13 wire envelopes.
 */
export function createChatWsV1Handlers(
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
