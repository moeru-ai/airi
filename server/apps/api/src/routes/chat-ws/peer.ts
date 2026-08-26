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
  /** Domain service that persists and reads chat messages. */
  chatService: ChatService
  /** Eventa websocket context for one authenticated peer. */
  ctx: HonoWsInvocableEventContext
  /** Optional engagement metrics. */
  metrics?: EngagementMetrics | null
  /** Shared local registry and Redis broadcast runtime. */
  runtime: ChatWsRuntime
  /** User that owns the authenticated peer. */
  userId: string
}

/**
 * Registers one authenticated chat peer with the shared Eventa beta.15 runtime.
 *
 * Both `/ws/chat` and `/ws/v2/chat` call this function after their own
 * authentication step. The beta.15 adapter accepts the beta.13 wire envelope.
 */
export function registerChatWsPeer(options: RegisterChatWsPeerOptions): void {
  const { chatService, ctx, metrics, runtime, userId } = options
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
    broadcast: runtime.broadcast,
    chatService,
    connectionId,
    ctx,
    metrics,
    registry: runtime.registry,
    userId,
  })
}
