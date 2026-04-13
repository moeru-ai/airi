import type Redis from 'ioredis'

import type { HonoWsInvocableEventContext } from '../../libs/eventa-hono-adapter'
import type { EngagementMetrics } from '../../libs/otel'
import type { ChatService } from '../../services/chats'

import { useLogger } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'

import { createPeerHooks, wsDisconnectedEvent } from '../../libs/eventa-hono-adapter'
import { createChatBroadcastMessage, parseChatBroadcastMessage } from '../../utils/chat-broadcast'
import { userChatBroadcastRedisKey } from '../../utils/redis-keys'

const log = useLogger('chat-ws').useGlobalConfig()

// ---------------------------------------------------------------------------
// Local connection registry (per-process)
// ---------------------------------------------------------------------------

const userConnections = new Map<string, Set<HonoWsInvocableEventContext>>()

function addConnection(userId: string, ctx: HonoWsInvocableEventContext) {
  let conns = userConnections.get(userId)
  if (!conns) {
    conns = new Set()
    userConnections.set(userId, conns)
  }
  conns.add(ctx)
}

function removeConnection(userId: string, ctx: HonoWsInvocableEventContext) {
  const conns = userConnections.get(userId)
  if (conns) {
    conns.delete(ctx)
    if (conns.size === 0)
      userConnections.delete(userId)
  }
}

function broadcastToLocalDevices(userId: string, excludeCtx: HonoWsInvocableEventContext | null, event: any, payload: any) {
  const conns = userConnections.get(userId)
  if (!conns)
    return
  for (const ctx of conns) {
    if (ctx !== excludeCtx) {
      ctx.emit(event, payload)
    }
  }
}

export function createChatWsHandlers(
  chatService: ChatService,
  redis: Redis,
  metrics?: EngagementMetrics | null,
) {
  // TODO: Separate connection lifecycle, cross-instance broadcast, and RPC orchestration into smaller modules.
  // This file is still acting as both transport adapter and chat delivery coordinator.
  // Dedicated subscriber connection (ioredis requires a separate connection for subscribe mode)
  const sub = redis.duplicate()

  sub.on('message', (_channel: string, message: string) => {
    try {
      const data = parseChatBroadcastMessage(message)
      // Deliver to all local connections of this user (no excludeCtx since the
      // sender is on a different instance)
      broadcastToLocalDevices(data.userId, null, newMessages, data.payload)
    }
    catch (err) {
      log.withError(err).error('Failed to parse broadcast message')
    }
  })

  /** Subscribe to a user's broadcast channel when they first connect on this instance. */
  function ensureSubscribed(userId: string) {
    const channel = userChatBroadcastRedisKey(userId)
    sub.subscribe(channel).catch((err) => {
      log.withError(err).error('Failed to subscribe to broadcast channel')
    })
  }

  /** Unsubscribe when the user has no more connections on this instance. */
  function maybeUnsubscribe(userId: string) {
    if (!userConnections.has(userId)) {
      const channel = userChatBroadcastRedisKey(userId)
      sub.unsubscribe(channel).catch((err) => {
        log.withError(err).error('Failed to unsubscribe from broadcast channel')
      })
    }
  }

  /** Publish a broadcast message so other instances can deliver it. */
  function publishBroadcast(userId: string, payload: Parameters<typeof createChatBroadcastMessage>[1]) {
    const channel = userChatBroadcastRedisKey(userId)
    const message = createChatBroadcastMessage(userId, payload)
    redis.publish(channel, JSON.stringify(message)).catch((err) => {
      log.withError(err).error('Failed to publish broadcast message')
    })
  }

  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        addConnection(userId, ctx)
        ensureSubscribed(userId)
        log.withFields({ userId }).log('WS connected')
        metrics?.wsConnectionsActive.add(1)

        ctx.on(wsDisconnectedEvent, () => {
          removeConnection(userId, ctx)
          maybeUnsubscribe(userId)
          log.withFields({ userId }).log('WS disconnected')
          metrics?.wsConnectionsActive.add(-1)
        })

        // RPC: send messages
        defineInvokeHandler(ctx, sendMessages, async (req) => {
          log.withFields({ userId, chatId: req!.chatId, count: req!.messages.length }).log('sendMessages')
          const result = await chatService.pushMessages(userId, req!.chatId, req!.messages)

          // Fetch the wire messages for broadcast
          const wireMessages = await chatService.pullMessages(userId, req!.chatId, result.fromSeq - 1, result.toSeq - result.fromSeq + 1)
          const broadcastPayload = {
            chatId: req!.chatId,
            messages: wireMessages.messages,
            fromSeq: result.fromSeq,
            toSeq: result.toSeq,
          }

          // Broadcast to all chat members (not just the sender)
          const members = await chatService.getMembers(req!.chatId)
          const memberUserIds = members
            .filter(m => m.memberType === 'user' && m.userId != null)
            .map(m => m.userId!)

          for (const memberUserId of memberUserIds) {
            // For the sender, exclude the current connection
            const excludeCtx = memberUserId === userId ? ctx : null
            broadcastToLocalDevices(memberUserId, excludeCtx, newMessages, broadcastPayload)
            // Cross-instance broadcast via Redis pub/sub
            publishBroadcast(memberUserId, broadcastPayload)
          }

          metrics?.wsMessagesSent.add(wireMessages.messages.length)
          return { seq: result.seq }
        })

        // RPC: pull messages
        defineInvokeHandler(ctx, pullMessages, async (req) => {
          log.withFields({ userId, chatId: req!.chatId, afterSeq: req!.afterSeq }).log('pullMessages')
          return chatService.pullMessages(userId, req!.chatId, req!.afterSeq, req!.limit)
        })
      },
    })
    return hooks
  }
}
