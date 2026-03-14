import type { EventContext } from '@moeru/eventa'

import type { EngagementMetrics } from '../libs/otel'
import type { ChatService } from '../services/chats'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk'

import { createPeerHooks, wsDisconnectedEvent } from '../libs/eventa-hono-adapter'

const log = useLogger('chat-ws').useGlobalConfig()

// Active connections per user (single-process only)
const userConnections = new Map<string, Set<EventContext>>()

function addConnection(userId: string, ctx: EventContext) {
  let conns = userConnections.get(userId)
  if (!conns) {
    conns = new Set()
    userConnections.set(userId, conns)
  }
  conns.add(ctx)
}

function removeConnection(userId: string, ctx: EventContext) {
  const conns = userConnections.get(userId)
  if (conns) {
    conns.delete(ctx)
    if (conns.size === 0)
      userConnections.delete(userId)
  }
}

function broadcastToOtherDevices(userId: string, senderCtx: EventContext, event: any, payload: any) {
  const conns = userConnections.get(userId)
  if (!conns)
    return
  for (const ctx of conns) {
    if (ctx !== senderCtx) {
      ctx.emit(event, payload)
    }
  }
}

export function createChatWsHandlers(chatService: ChatService, metrics?: EngagementMetrics | null) {
  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        addConnection(userId, ctx)
        log.withFields({ userId }).log('WS connected')
        metrics?.wsConnectionsActive.add(1)

        ctx.on(wsDisconnectedEvent, () => {
          removeConnection(userId, ctx)
          log.withFields({ userId }).log('WS disconnected')
          metrics?.wsConnectionsActive.add(-1)
        })

        // RPC: send messages
        defineInvokeHandler(ctx as any, sendMessages, async (req) => {
          log.withFields({ userId, chatId: req!.chatId, count: req!.messages.length }).log('sendMessages')
          const result = await chatService.pushMessages(userId, req!.chatId, req!.messages)

          // Broadcast to other devices
          const wireMessages = await chatService.pullMessages(userId, req!.chatId, result.fromSeq - 1, result.toSeq - result.fromSeq + 1)
          broadcastToOtherDevices(userId, ctx, newMessages, {
            chatId: req!.chatId,
            messages: wireMessages.messages,
            fromSeq: result.fromSeq,
            toSeq: result.toSeq,
          })
          metrics?.wsMessagesSent.add(wireMessages.messages.length)
          return { seq: result.seq }
        })

        // RPC: pull messages
        defineInvokeHandler(ctx as any, pullMessages, async (req) => {
          log.withFields({ userId, chatId: req!.chatId, afterSeq: req!.afterSeq }).log('pullMessages')
          return chatService.pullMessages(userId, req!.chatId, req!.afterSeq, req!.limit)
        })
      },
    })
    return hooks
  }
}
