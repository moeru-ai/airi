import type { useLogger } from '@guiiai/logg'
import type Redis from 'ioredis'

import type { GatewayMetrics } from '../../../otel'
import type { LlmRouterService } from './router'

/**
 * Dependencies needed to wire the cross-instance config invalidation
 * subscriber.
 */
export interface ConfigSyncSubscriberOptions {
  /**
   * Primary Redis client. The subscriber takes its own connection via
   * `.duplicate()` because ioredis forbids non-pubsub commands on a
   * connection in subscribe mode.
   */
  redis: Redis
  /** Router service whose in-memory `LLM_ROUTER_CONFIG` cache we invalidate. */
  llmRouter: LlmRouterService
  /**
   * OTel gateway metric bundle. `null` when OTel is disabled — emit calls
   * become no-ops.
   */
  gatewayMetrics: GatewayMetrics | null
  /** Value attached to the `service_instance_id` label on emitted metrics. */
  instanceId: string
  /** Logger handle. Caller supplies a scoped logger so namespacing is theirs. */
  logger: ReturnType<typeof useLogger>
}

/**
 * Per-call shape returned to the caller. Kept narrow so the caller can hold
 * the subscriber handle for graceful shutdown or tests without leaking the
 * internal emit closure.
 */
export interface ConfigSyncSubscriber {
  /** Underlying ioredis subscriber connection. */
  subscriber: Redis
}

/**
 * Wires the cross-instance `configkv:invalidate` subscriber to the router's
 * cache and OTel gateway metrics.
 *
 * Use when:
 * - Booting a server replica that has a live `LlmRouterService` and needs
 *   to react to peer-instance config writes within the Pub/Sub propagation
 *   window (R16 / KTD-4, ≤5s under healthy Redis).
 *
 * Expects:
 * - `redis` is the application's primary client. We `.duplicate()` it here
 *   because ioredis forbids non-pubsub commands on a subscribed connection.
 * - `llmRouter` is already constructed. The caller owns its lifecycle.
 *
 * Returns:
 * - `subscriber` — the dedicated ioredis subscriber connection, so the
 *   caller can `await subscriber.quit()` during graceful shutdown.
 *
 * Emits the following `airi.gen_ai.gateway.*` metrics:
 * - `config_reload` (source = `pubsub`) once per accepted invalidation msg
 * - `subscriber_state` with `state` = `connected` / `error` / `reconnecting`
 *
 * The router's in-memory cache reloads on either a pub/sub message OR the
 * `configCacheTtlMs` fallback (default 5s); a silently-disconnected
 * subscriber means the instance drifts inside that window. `subscriber_state`
 * is the only direct signal for that drift.
 */
export function createConfigSyncSubscriber(opts: ConfigSyncSubscriberOptions): ConfigSyncSubscriber {
  const subscriber = opts.redis.duplicate()

  function recordSubscriberState(state: 'connected' | 'error' | 'reconnecting') {
    opts.gatewayMetrics?.subscriberState.add(1, {
      state,
      service_instance_id: opts.instanceId,
    })
  }

  subscriber.on('message', (channel, message) => {
    if (channel !== 'configkv:invalidate')
      return
    try {
      const payload = JSON.parse(message) as { key?: unknown }
      // LLM_ROUTER_CONFIG drives a model-config cache + voice-catalog cache
      // invalidation (key rotation, model add/remove, region swap all need to
      // surface immediately). UNSPEECH_UPSTREAM only affects the voice catalog
      // cache because no other in-process structure references it.
      if (payload?.key === 'LLM_ROUTER_CONFIG') {
        opts.llmRouter.invalidateConfig()
        void opts.llmRouter.invalidateTtsVoicesCache().catch((err) => {
          opts.logger.withError(err).warn('Failed to invalidate tts voices cache on LLM_ROUTER_CONFIG change')
        })
        opts.gatewayMetrics?.configReload.add(1, {
          source: 'pubsub',
          service_instance_id: opts.instanceId,
        })
        return
      }
      if (payload?.key === 'UNSPEECH_UPSTREAM') {
        void opts.llmRouter.invalidateTtsVoicesCache().catch((err) => {
          opts.logger.withError(err).warn('Failed to invalidate tts voices cache on UNSPEECH_UPSTREAM change')
        })
      }
    }
    catch (err) {
      opts.logger.withError(err).warn('Failed to parse configkv:invalidate payload')
    }
  })

  subscriber.on('error', (err: Error) => {
    opts.logger.withError(err).warn('configkv:invalidate subscriber connection error')
    recordSubscriberState('error')
  })

  // ioredis emits `reconnecting` before each reconnect attempt; the
  // subscription itself is restored automatically because `autoResubscribe`
  // defaults to true.
  subscriber.on('reconnecting', () => recordSubscriberState('reconnecting'))

  subscriber.subscribe('configkv:invalidate')
    .then(() => recordSubscriberState('connected'))
    .catch((err: unknown) => {
      opts.logger.withError(err).warn('Failed to subscribe to configkv:invalidate channel')
      recordSubscriberState('error')
    })

  return { subscriber }
}
