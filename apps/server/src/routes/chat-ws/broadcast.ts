import type Redis from 'ioredis'

import type { ChatBroadcastPayload } from '../../utils/chat-broadcast'
import type { ChatConnectionRegistry } from './connection-registry'

import { useLogger } from '@guiiai/logg'

import { createChatBroadcastMessage, parseChatBroadcastMessage } from '../../utils/chat-broadcast'
import { userChatBroadcastRedisKey } from '../../utils/redis-keys'

const log = useLogger('chat-ws').useGlobalConfig()

/**
 * Cross-instance chat broadcast coordinator.
 */
export interface ChatBroadcastCoordinator {
  /** Subscribes this process to the user's Redis channel. */
  ensureSubscribed: (userId: string) => void
  /** Unsubscribes once this process has no local devices for the user. */
  maybeUnsubscribe: (userId: string) => void
  /** Publishes a validated notification for other instances to fan out locally. */
  publish: (userId: string, payload: ChatBroadcastPayload) => void
}

export interface ChatBroadcastCoordinatorOptions {
  /** Redis connection used for publish and duplicate subscriber creation. */
  redis: Redis
  /** Local registry that receives messages from other instances. */
  registry: ChatConnectionRegistry
  /** Stable per-process id used to skip self-published messages. */
  instanceId: string
}

/**
 * Creates the Redis Pub/Sub coordinator for chat websocket notifications.
 *
 * Use when:
 * - Local device fanout must also notify devices connected to other API instances.
 *
 * Expects:
 * - Redis Pub/Sub is used only as a best-effort notification channel.
 * - Durable chat truth remains in `ChatService` and clients can recover with `pullMessages`.
 *
 * Returns:
 * - A small coordinator for subscribe, unsubscribe, and publish operations.
 */
export function createChatBroadcastCoordinator(options: ChatBroadcastCoordinatorOptions): ChatBroadcastCoordinator {
  // Dedicated subscriber connection (ioredis requires a separate connection for subscribe mode).
  const sub = options.redis.duplicate()

  sub.on('message', (_channel: string, message: string) => {
    try {
      const data = parseChatBroadcastMessage(message)
      // Skip messages we ourselves published. ioredis pub/sub delivers to
      // every subscriber, including the publishing connection — without
      // this filter the publisher's local peers would receive each message
      // twice (once via in-process broadcastToLocalDevices, once via the
      // sub callback) and the sender's own ctx would receive an unwanted
      // echo.
      if (data.originInstanceId === options.instanceId)
        return
      // Cross-instance delivery: hand off to local peers of this user.
      // No excludeCtx because the sender lives on a different instance.
      options.registry.emitNewMessages(data.userId, null, data.payload)
    }
    catch (err) {
      log.withError(err).error('Failed to parse broadcast message')
    }
  })

  return {
    ensureSubscribed(userId) {
      const channel = userChatBroadcastRedisKey(userId)
      sub.subscribe(channel).catch((err) => {
        log.withError(err).error('Failed to subscribe to broadcast channel')
      })
    },

    maybeUnsubscribe(userId) {
      if (options.registry.hasUser(userId))
        return

      const channel = userChatBroadcastRedisKey(userId)
      sub.unsubscribe(channel).catch((err) => {
        log.withError(err).error('Failed to unsubscribe from broadcast channel')
      })
    },

    publish(userId, payload) {
      const channel = userChatBroadcastRedisKey(userId)
      const message = createChatBroadcastMessage(userId, payload, options.instanceId)
      options.redis.publish(channel, JSON.stringify(message)).catch((err) => {
        log.withError(err).error('Failed to publish broadcast message')
      })
    },
  }
}
