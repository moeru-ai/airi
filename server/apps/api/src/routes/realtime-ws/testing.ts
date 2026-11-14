import type Redis from 'ioredis'

/**
 * A Redis Pub/Sub double for relay tests. Every connection that `duplicate` returns shares one channel table, as
 * the API instances share one Redis.
 *
 * @example
 * const bus = createPubSubBus()
 * const relayA = createRealtimeRelay({ redis: bus.connect(), instanceId: 'a' })
 * const relayB = createRealtimeRelay({ redis: bus.connect(), instanceId: 'b' })
 */
export function createPubSubBus() {
  const subscribers = new Set<{ channels: Set<string>, listeners: Array<(channel: string, message: string) => void> }>()

  function connect(): Redis {
    const subscriber = { channels: new Set<string>(), listeners: [] as Array<(channel: string, message: string) => void> }
    subscribers.add(subscriber)

    const connection = {
      duplicate: () => connect(),
      on(event: string, listener: (channel: string, message: string) => void) {
        if (event === 'message')
          subscriber.listeners.push(listener)
        return connection
      },
      async subscribe(channel: string) {
        subscriber.channels.add(channel)
      },
      async unsubscribe(channel: string) {
        subscriber.channels.delete(channel)
      },
      async publish(channel: string, message: string) {
        for (const target of subscribers) {
          if (target.channels.has(channel))
            target.listeners.forEach(listener => listener(channel, message))
        }
        return 1
      },
    }
    return connection as unknown as Redis
  }

  return {
    connect,
    /** Publishes a raw message, as another service or a broken instance can. */
    publishRaw(channel: string, message: string) {
      for (const target of subscribers) {
        if (target.channels.has(channel))
          target.listeners.forEach(listener => listener(channel, message))
      }
    },
    subscribedChannels: () => [...subscribers].flatMap(subscriber => [...subscriber.channels]),
  }
}
