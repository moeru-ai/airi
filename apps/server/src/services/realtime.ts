import type { WSContext } from 'hono/ws'
import type Redis from 'ioredis'

import { useLogger } from '@guiiai/logg'

interface WsConnection {
  userId: string
  ws: WSContext
  subscribedChats: Set<string>
}

export interface RealtimeEvent {
  type: string
  chatId: string
  [key: string]: unknown
}

export function createRealtimeService(redis: Redis) {
  const logger = useLogger('realtime').useGlobalConfig()
  const connections = new Map<string, WsConnection[]>()
  const subscriber = redis.duplicate()

  // Track which channels we're subscribed to globally
  const subscribedChannels = new Set<string>()

  function channelKey(chatId: string) {
    return `chat:${chatId}:events`
  }

  // Handle incoming Redis pub/sub messages
  subscriber.on('message', (_channel: string, rawMessage: string) => {
    try {
      const event = JSON.parse(rawMessage) as RealtimeEvent
      const chatId = event.chatId

      // Fan out to all WS connections subscribed to this chat
      for (const conns of connections.values()) {
        for (const conn of conns) {
          if (conn.subscribedChats.has(chatId)) {
            try {
              conn.ws.send(rawMessage)
            }
            catch {
              // Connection might be closed
            }
          }
        }
      }
    }
    catch (err) {
      logger.withError(err).warn('Failed to process pub/sub message')
    }
  })

  return {
    /**
     * Register a new WebSocket connection.
     */
    addConnection(userId: string, ws: WSContext): WsConnection {
      const conn: WsConnection = { userId, ws, subscribedChats: new Set() }
      const existing = connections.get(userId) ?? []
      existing.push(conn)
      connections.set(userId, existing)
      logger.withFields({ userId }).log('WS connection added')
      return conn
    },

    /**
     * Remove a WebSocket connection.
     */
    removeConnection(conn: WsConnection) {
      const existing = connections.get(conn.userId) ?? []
      const filtered = existing.filter(c => c !== conn)
      if (filtered.length === 0) {
        connections.delete(conn.userId)
      }
      else {
        connections.set(conn.userId, filtered)
      }

      // Unsubscribe from channels no longer needed
      for (const chatId of conn.subscribedChats) {
        const stillNeeded = this.isChatSubscribed(chatId)
        if (!stillNeeded) {
          const channel = channelKey(chatId)
          subscriber.unsubscribe(channel)
          subscribedChannels.delete(channel)
        }
      }

      logger.withFields({ userId: conn.userId }).log('WS connection removed')
    },

    /**
     * Subscribe a connection to chat channels.
     */
    async subscribe(conn: WsConnection, chatIds: string[]) {
      for (const chatId of chatIds) {
        conn.subscribedChats.add(chatId)
        const channel = channelKey(chatId)
        if (!subscribedChannels.has(channel)) {
          await subscriber.subscribe(channel)
          subscribedChannels.add(channel)
        }
      }
    },

    /**
     * Unsubscribe a connection from chat channels.
     */
    async unsubscribe(conn: WsConnection, chatIds: string[]) {
      for (const chatId of chatIds) {
        conn.subscribedChats.delete(chatId)
        if (!this.isChatSubscribed(chatId)) {
          const channel = channelKey(chatId)
          await subscriber.unsubscribe(channel)
          subscribedChannels.delete(channel)
        }
      }
    },

    /**
     * Check if any connection is subscribed to a chat.
     */
    isChatSubscribed(chatId: string): boolean {
      for (const conns of connections.values()) {
        for (const conn of conns) {
          if (conn.subscribedChats.has(chatId))
            return true
        }
      }
      return false
    },

    /**
     * Publish an event to a chat channel via Redis.
     * All WS instances will receive it via pub/sub.
     */
    async publish(event: RealtimeEvent) {
      const channel = channelKey(event.chatId)
      await redis.publish(channel, JSON.stringify(event))
    },

    /**
     * Get connection count for a user.
     */
    getConnectionCount(userId: string): number {
      return (connections.get(userId) ?? []).length
    },
  }
}

export type RealtimeService = ReturnType<typeof createRealtimeService>
