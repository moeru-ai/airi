import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'
import type { ChatBroadcastCoordinator } from './broadcast'
import type { ChatConnectionRegistry } from './connection-registry'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'

const log = useLogger('chat-ws').useGlobalConfig()

export interface RegisterChatRpcHandlersOptions {
  /** Eventa websocket context for the connected peer. */
  ctx: HonoWsInvocableEventContext
  /** Authenticated user that owns this websocket connection. */
  userId: string
  /** Domain service that persists and reads chat messages. */
  chatService: ChatService
  /** Local websocket registry for same-instance fanout. */
  registry: ChatConnectionRegistry
  /** Redis coordinator for cross-instance fanout. */
  broadcast: ChatBroadcastCoordinator
  /** Optional engagement metrics. */
  metrics?: EngagementMetrics | null
}

/**
 * Registers chat Eventa RPC handlers on one websocket context.
 *
 * Use when:
 * - A peer context has just been created by the Hono Eventa adapter.
 *
 * Expects:
 * - `chatService` enforces membership and message sequencing.
 *
 * Returns:
 * - Nothing; handlers are attached to the provided context.
 */
export function registerChatRpcHandlers(options: RegisterChatRpcHandlersOptions): void {
  const { ctx, userId, chatService, registry, broadcast, metrics } = options

  defineInvokeHandler(ctx, sendMessages, async (req) => {
    log.withFields({ userId, chatId: req!.chatId, count: req!.messages.length }).log('sendMessages')
    const result = await chatService.pushMessages(userId, req!.chatId, req!.messages)

    const wireMessages = await chatService.pullMessages(userId, req!.chatId, result.fromSeq - 1, result.toSeq - result.fromSeq + 1)
    const broadcastPayload = {
      chatId: req!.chatId,
      messages: wireMessages.messages,
      fromSeq: result.fromSeq,
      toSeq: result.toSeq,
    }

    const members = await chatService.getMembers(req!.chatId)
    const memberUserIds = members
      .filter(m => m.memberType === 'user' && m.userId != null)
      .map(m => m.userId!)

    for (const memberUserId of memberUserIds) {
      const excludeCtx = memberUserId === userId ? ctx : null
      registry.emitNewMessages(memberUserId, excludeCtx, broadcastPayload)
      broadcast.publish(memberUserId, broadcastPayload)
    }

    metrics?.wsMessagesSent.add(wireMessages.messages.length)
    return { seq: result.seq }
  })

  defineInvokeHandler(ctx, pullMessages, async (req) => {
    log.withFields({ userId, chatId: req!.chatId, afterSeq: req!.afterSeq }).log('pullMessages')
    return chatService.pullMessages(userId, req!.chatId, req!.afterSeq, req!.limit)
  })
}
