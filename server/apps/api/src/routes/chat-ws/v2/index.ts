import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'
import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatWsRuntime } from '../runtime'

import { useLogger } from '@guiiai/logg'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { newMessages } from '@proj-airi/server-sdk-shared/v2'

import { nanoid } from '../../../utils/id'
import { createChatWsRuntime } from '../runtime'
import { registerChatRpcHandlers } from './rpc'

const log = useLogger('chat-ws').useGlobalConfig()

interface ChatWsHandlerDependencies {
  chatService: ChatService
  runtime: ChatWsRuntime
  metrics?: EngagementMetrics | null
}

function registerAuthenticatedPeer(
  ctx: HonoWsInvocableEventContext,
  userId: string,
  deps: ChatWsHandlerDependencies,
): void {
  const connectionId = nanoid()
  deps.runtime.registry.add(userId, connectionId, (payload) => {
    void ctx.emit(newMessages, payload)
  })
  deps.runtime.broadcast.ensureSubscribed(userId)
  log.withFields({ userId }).log('WS connected')

  ctx.on(wsDisconnectedEvent, () => {
    deps.runtime.registry.remove(userId, connectionId)
    deps.runtime.broadcast.maybeUnsubscribe(userId)
    log.withFields({ userId }).log('WS disconnected')
  })

  registerChatRpcHandlers({
    ctx,
    connectionId,
    userId,
    chatService: deps.chatService,
    registry: deps.runtime.registry,
    broadcast: deps.runtime.broadcast,
    metrics: deps.metrics,
  })
}

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
        registerAuthenticatedPeer(ctx, userId, { chatService, runtime: chatRuntime, metrics })
      },
    })
    return hooks
  }
}
