import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'
import type { ChatBroadcastCoordinator } from './broadcast'
import type { ChatConnectionRegistry } from './connection-registry'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { parsePullMessagesRequest, parseSendMessagesRequest, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'

const log = useLogger('chat-ws').useGlobalConfig()

export interface RegisterChatRpcHandlersOptions {
  /** Redis coordinator for cross-instance fanout. */
  broadcast: ChatBroadcastCoordinator
  /** Domain service that persists and reads chat messages. */
  chatService: ChatService
  /** Stable id for this connection in the shared registry. */
  connectionId: string
  /** Eventa websocket context for the connected peer. */
  ctx: HonoWsInvocableEventContext
  /** Optional engagement metrics. */
  metrics?: EngagementMetrics | null
  /** Local websocket registry for same-instance fanout. */
  registry: ChatConnectionRegistry
  /** Authenticated user that owns this websocket connection. */
  userId: string
}

/**
 * Registers chat RPC handlers that both WebSocket URL versions share.
 *
 * The Eventa beta.15 adapter accepts beta.13 envelopes. Parse each request
 * before the handler reads its fields or calls the chat service.
 */
export function registerChatRpcHandlers(options: RegisterChatRpcHandlersOptions): void {
  const { broadcast, chatService, connectionId, ctx, metrics, registry, userId } = options

  defineInvokeHandler(ctx, sendMessages, async (req) => {
    const request = parseSendMessagesRequest(req)
    log.withFields({ chatId: request.chatId, count: request.messages.length, userId }).log('sendMessages')
    const result = await chatService.pushMessages(userId, request.chatId, request.messages)

    const wireMessages = await chatService.pullMessages(userId, request.chatId, result.fromSeq - 1, result.toSeq - result.fromSeq + 1)
    const broadcastPayload = {
      chatId: request.chatId,
      fromSeq: result.fromSeq,
      messages: wireMessages.messages,
      toSeq: result.toSeq,
    }

    const members = await chatService.getMembers(request.chatId)
    const memberUserIds = members
      .filter(m => m.memberType === 'user' && m.userId != null)
      .map(m => m.userId!)

    for (const memberUserId of memberUserIds) {
      const excludeConnectionId = memberUserId === userId ? connectionId : null
      registry.emitNewMessages(memberUserId, excludeConnectionId, broadcastPayload)
      broadcast.publish(memberUserId, broadcastPayload)
    }

    metrics?.wsMessagesSent.add(wireMessages.messages.length)
    return { seq: result.seq }
  })

  defineInvokeHandler(ctx, pullMessages, async (req) => {
    const request = parsePullMessagesRequest(req)
    log.withFields({ afterSeq: request.afterSeq, chatId: request.chatId, userId }).log('pullMessages')
    return chatService.pullMessages(userId, request.chatId, request.afterSeq, request.limit)
  })
}
