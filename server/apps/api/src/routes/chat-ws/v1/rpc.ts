import type { EngagementMetrics } from '../../../otel'
import type { ChatService } from '../../../services/domain/chats'
import type { ChatBroadcastCoordinator } from '../broadcast'
import type { ChatConnectionRegistry } from '../connection-registry'
import type { ChatWsV1Context } from './adapter'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa-legacy'
import { pullMessages, sendMessages } from '@proj-airi/server-sdk-shared/v1'

const log = useLogger('chat-ws:v1').useGlobalConfig()

interface RegisterChatWsV1RpcHandlersOptions {
  ctx: ChatWsV1Context
  userId: string
  chatService: ChatService
  registry: ChatConnectionRegistry
  connectionId: string
  broadcast: ChatBroadcastCoordinator
  metrics?: EngagementMetrics | null
}

export function registerChatWsV1RpcHandlers(options: RegisterChatWsV1RpcHandlersOptions): void {
  const { ctx, userId, chatService, registry, connectionId, broadcast, metrics } = options

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
      const excludeConnectionId = memberUserId === userId ? connectionId : null
      registry.emitNewMessages(memberUserId, excludeConnectionId, broadcastPayload)
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
