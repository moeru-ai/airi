import type Redis from 'ioredis'

import { useLogger } from '@guiiai/logg'
import { nonEmpty, object, parse, pipe, string } from 'valibot'

import { nanoid } from '../../utils/id'
import { userRealtimeRelayRedisKey } from '../../utils/redis-keys'

const log = useLogger('realtime-ws').useGlobalConfig()

/** One frame on its way between API instances. Redis Pub/Sub is a trust boundary, so the subscriber parses it. */
const RelayMessageSchema = object({
  originInstanceId: pipe(string(), nonEmpty()),
  userId: pipe(string(), nonEmpty()),
  frame: pipe(string(), nonEmpty()),
})

export interface RelayConnection {
  /** Sends one frame to every other connection of the user, on this instance and on the others. */
  forward: (frame: string) => void
  /** Removes the connection. A second call does nothing. */
  leave: () => void
}

/**
 * Forwards frames between the connections of one user.
 *
 * State model: `connections` holds the sockets of this process only. Nothing is persisted. A frame for a device
 * that is not connected is lost, and the devices repeat discovery after they reconnect.
 */
export interface RealtimeRelay {
  /** Adds one authenticated connection. `send` writes a frame to its socket. */
  join: (userId: string, send: (frame: string) => void) => RelayConnection
  /** Counts the local connections of all users. */
  activeCount: () => number
}

export interface RealtimeRelayOptions {
  /** Used to publish. The relay duplicates it for the subscriber, because a subscribed connection cannot publish. */
  redis: Redis
  /** Identifies this process, so that the subscriber skips the frames that this process published. */
  instanceId: string
}

export function createRealtimeRelay(options: RealtimeRelayOptions): RealtimeRelay {
  const connections = new Map<string, Map<string, (frame: string) => void>>()
  const subscriber = options.redis.duplicate()

  function deliver(userId: string, exceptConnectionId: string | null, frame: string): void {
    const sends = connections.get(userId)
    if (!sends)
      return

    for (const [connectionId, send] of sends) {
      if (connectionId !== exceptConnectionId)
        send(frame)
    }
  }

  subscriber.on('message', (_channel: string, raw: string) => {
    try {
      const message = parse(RelayMessageSchema, JSON.parse(raw))
      // This process already delivered the frame to its local connections in `forward`.
      if (message.originInstanceId === options.instanceId)
        return

      deliver(message.userId, null, message.frame)
    }
    catch (error) {
      log.withError(error).error('Failed to parse a relay message')
    }
  })

  return {
    join(userId, send) {
      const connectionId = nanoid()
      let sends = connections.get(userId)
      if (!sends) {
        sends = new Map()
        connections.set(userId, sends)
        subscriber.subscribe(userRealtimeRelayRedisKey(userId)).catch((error) => {
          log.withError(error).error('Failed to subscribe to the relay channel')
        })
      }
      sends.set(connectionId, send)

      let joined = true
      return {
        forward(frame) {
          if (!joined)
            return

          deliver(userId, connectionId, frame)
          const message = JSON.stringify({ originInstanceId: options.instanceId, userId, frame })
          // A lost frame is a lost control event. The devices time out and repeat it, so the sender is not told.
          options.redis.publish(userRealtimeRelayRedisKey(userId), message).catch((error) => {
            log.withError(error).error('Failed to publish a relay frame')
          })
        },
        leave() {
          if (!joined)
            return

          joined = false
          const current = connections.get(userId)
          current?.delete(connectionId)
          if (current?.size !== 0)
            return

          connections.delete(userId)
          subscriber.unsubscribe(userRealtimeRelayRedisKey(userId)).catch((error) => {
            log.withError(error).error('Failed to unsubscribe from the relay channel')
          })
        },
      }
    },

    activeCount() {
      let total = 0
      for (const sends of connections.values())
        total += sends.size
      return total
    },
  }
}
