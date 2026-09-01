import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'
import type { ChatWsRuntime } from './runtime'

import { useLogger } from '@guiiai/logg'
import { wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { newMessages } from '@proj-airi/server-sdk-shared'

import { nanoid } from '../../utils/id'
import { registerChatRpcHandlers } from './rpc'

const log = useLogger('chat-ws').useGlobalConfig()

export interface RegisterChatWsPeerOptions {
  /** Eventa websocket context for one authenticated peer. */
  ctx: HonoWsInvocableEventContext
  /** User that owns the authenticated peer. */
  userId: string
  /** Domain service that persists and reads chat messages. */
  chatService: ChatService
  /** Shared local registry and Redis broadcast runtime. */
  runtime: ChatWsRuntime
  /** Optional engagement metrics. */
  metrics?: EngagementMetrics | null
}

/**
 * Registers one authenticated chat peer with the shared Eventa beta.15 runtime.
 *
 * Both `/ws/chat` and `/ws/v2/chat` call this function after their own
 * authentication step. The beta.15 adapter accepts the beta.13 wire envelope.
 */
export function registerChatWsPeer(options: RegisterChatWsPeerOptions): void {
  const { ctx, userId, chatService, runtime, metrics } = options
  const connectionId = nanoid()
  runtime.registry.add(userId, connectionId, (payload) => {
    void ctx.emit(newMessages, payload)
  })
  runtime.broadcast.ensureSubscribed(userId)
  log.withFields({ userId }).log('WS connected')

  ctx.on(wsDisconnectedEvent, () => {
    runtime.registry.remove(userId, connectionId)
    runtime.broadcast.maybeUnsubscribe(userId)
    log.withFields({ userId }).log('WS disconnected')
  })

  registerChatRpcHandlers({
    ctx,
    connectionId,
    userId,
    chatService,
    registry: runtime.registry,
    broadcast: runtime.broadcast,
    metrics,
  })
}
