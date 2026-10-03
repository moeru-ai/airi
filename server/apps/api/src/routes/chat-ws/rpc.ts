import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'

import type { EngagementMetrics } from '../../otel'
import type { ChatService } from '../../services/domain/chats'
import type { ChatBroadcastCoordinator } from './broadcast'
import type { ChatConnectionRegistry } from './connection-registry'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { deleteMessages, parseDeleteMessagesRequest, parsePullMessagesRequest, parseSendMessagesRequest, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'

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
  /** Stable id for this connection in the shared registry. */
  connectionId: string
  /** Redis coordinator for cross-instance fanout. */
  broadcast: ChatBroadcastCoordinator
  /** Optional engagement metrics. */
  metrics?: EngagementMetrics | null
}

/**
 * Registers chat RPC handlers that both WebSocket URL versions share.
 *
 * The Eventa beta.15 adapter accepts beta.13 envelopes. Parse each request
 * before the handler reads its fields or calls the chat service.
 */
export function registerChatRpcHandlers(options: RegisterChatRpcHandlersOptions): void {
  const { ctx, userId, chatService, registry, connectionId, broadcast, metrics } = options

  /**
   * Sends the messages in `fromSeq..toSeq` to every user member. The calling
   * connection is excluded because it already has the change.
   */
  async function fanOut(chatId: string, fromSeq: number, toSeq: number) {
    const wireMessages = await chatService.pullMessages(userId, chatId, fromSeq - 1, toSeq - fromSeq + 1)
    const broadcastPayload = {
      chatId,
      messages: wireMessages.messages,
      fromSeq,
      toSeq,
    }

    const members = await chatService.getMembers(chatId)
    const memberUserIds = members
      .filter(m => m.memberType === 'user' && m.userId != null)
      .map(m => m.userId!)

    for (const memberUserId of memberUserIds) {
      const excludeConnectionId = memberUserId === userId ? connectionId : null
      registry.emitNewMessages(memberUserId, excludeConnectionId, broadcastPayload)
      broadcast.publish(memberUserId, broadcastPayload)
    }

    return wireMessages.messages.length
  }

  defineInvokeHandler(ctx, sendMessages, async (req) => {
    const request = parseSendMessagesRequest(req)
    log.withFields({ userId, chatId: request.chatId, count: request.messages.length }).log('sendMessages')
    const result = await chatService.pushMessages(userId, request.chatId, request.messages)

    const sentCount = await fanOut(request.chatId, result.fromSeq, result.toSeq)

    metrics?.wsMessagesSent.add(sentCount)
    return { seq: result.seq }
  })

  defineInvokeHandler(ctx, deleteMessages, async (req) => {
    const request = parseDeleteMessagesRequest(req)
    log.withFields({ userId, chatId: request.chatId, count: request.messageIds.length }).log('deleteMessages')
    const result = await chatService.deleteMessages(userId, request.chatId, request.messageIds)

    if (result.toSeq >= result.fromSeq)
      await fanOut(request.chatId, result.fromSeq, result.toSeq)

    return { seq: result.seq }
  })

  defineInvokeHandler(ctx, pullMessages, async (req) => {
    const request = parsePullMessagesRequest(req)
    log.withFields({ userId, chatId: request.chatId, afterSeq: request.afterSeq }).log('pullMessages')
    return chatService.pullMessages(userId, request.chatId, request.afterSeq, request.limit)
  })
}
