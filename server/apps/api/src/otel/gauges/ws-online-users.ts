import type { EngagementMetrics, ObservabilityMetrics } from '..'

import { useLogger } from '@guiiai/logg'

import { userChatBroadcastRedisPattern } from '../../utils/redis-keys'

interface PubSubChannelReader {
  pubsub: (subcommand: 'CHANNELS', pattern: string) => Promise<unknown[]>
}

/**
 * Wires `ws.users.online` to the cluster-wide set of active chat broadcast
 * channels in Redis.
 *
 * Each process subscribes once to `user:<id>:chat:broadcast` while it has at
 * least one local WebSocket for that user. `PUBSUB CHANNELS` returns channel
 * names uniquely, so multiple tabs and multiple server replicas still count as
 * one online user. Redis removes subscriptions automatically when a process
 * disconnects.
 *
 * Every replica reads the same cluster-wide value. Dashboards must aggregate
 * this gauge with `max()` or `avg()`, never `sum()`.
 */
export function registerWsOnlineUsersGauge(
  gauge: EngagementMetrics['wsUsersOnline'],
  redis: PubSubChannelReader,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('ws-online-users-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 10_000

  let cachedAt = 0
  let cachedCount = 0
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      const channels = await redis.pubsub('CHANNELS', userChatBroadcastRedisPattern())
      cachedCount = channels.length
      cachedAt = Date.now()
      return true
    }
    catch (error) {
      log.withError(error).warn('Failed to read online websocket users for gauge')
      metricReadErrors.add(1, { metric: 'ws.users.online' })
      return false
    }
  }

  gauge.addCallback(async (result) => {
    const now = Date.now()

    if (cachedAt !== 0 && now - cachedAt < CACHE_TTL_MS) {
      result.observe(cachedCount)
      return
    }

    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }

    if (await refreshInFlight)
      result.observe(cachedCount)
    // Redis failures intentionally skip this export cycle. Reporting zero
    // would turn an observability outage into a false "nobody is online".
  })
}
