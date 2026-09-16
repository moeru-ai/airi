import type Redis from 'ioredis'

import {
  ttsPoolInflightRedisKey,
  ttsPoolKnownRedisKey,
  ttsPoolSaturatedRedisKey,
} from '../../../utils/redis-keys'

// NOTICE: Atomic capacity-gated acquire. The TTSpool routes requests across
// multiple app_ids, each capped at a small concurrency limit (e.g. 10). To use
// the pooled capacity without overshooting any single app_id, we track in-flight
// requests per pool in Redis (shared across replicas — the server is multi-instance
// on Railway). A check-then-INCR done in two round-trips would race between
// replicas and overshoot the cap, so the check + increment happen inside one Lua
// script. The EXPIRE bounds leakage: if a replica crashes between acquire and
// release, the counter self-heals after `inflightTtlSeconds` instead of pinning
// the pool as permanently full. Source: flux-meter.ts ACCUMULATE_SCRIPT (same
// "INCR + EXPIRE, TTL survives crash" shape).
const ACQUIRE_SCRIPT = `
local inflightKey = KEYS[1]
local knownKey = KEYS[2]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local poolId = ARGV[3]

local current = tonumber(redis.call('GET', inflightKey) or '0')
if current < max then
  local next = redis.call('INCR', inflightKey)
  redis.call('EXPIRE', inflightKey, ttl)
  redis.call('SADD', knownKey, poolId)
  return next
end

return -1
`

// NOTICE: Floor-guarded release. A bare DECR on a missing/expired key would
// drive the counter negative (Redis DECR on a nonexistent key yields -1), which
// would then let the pool accept more than `max` concurrent requests. Guarding
// with GET>0 inside Lua keeps release idempotent against the TTL self-heal: if
// the inflight key already expired, release is a no-op rather than a corruption.
const RELEASE_SCRIPT = `
local inflightKey = KEYS[1]
local current = tonumber(redis.call('GET', inflightKey) or '0')
if current > 0 then
  return redis.call('DECR', inflightKey)
end
return 0
`

/**
 * Tracks per-pool in-flight concurrency in Redis so the TTS router can spread
 * load across multiple app_ids without overshooting any one app_id's cap.
 *
 * Use when:
 * - Building the LLM/TTS router service (`createLlmRouterService`), which
 *   acquires a slot before dispatching to a capacity-capped upstream and
 *   releases it once the attempt finishes.
 *
 * Expects:
 * - `redis` is the shared cluster Redis (the same instance the flux meter and
 *   config cache use). Counts are cluster-wide, not per-process.
 *
 * Returns:
 * - An acquire/release/saturation API. `tryAcquire` is the only capacity
 *   decision; everything else is bookkeeping the router and the watermark
 *   gauge read.
 */
export function createConcurrencyLedger(redis: Redis, options?: {
  /**
   * TTL (seconds) on the in-flight counter. Bounds leakage when a replica
   * crashes between acquire and release. Should comfortably exceed the longest
   * single TTS attempt so a live request is never evicted mid-flight.
   * @default 60
   */
  inflightTtlSeconds?: number
}) {
  const inflightTtlSeconds = options?.inflightTtlSeconds ?? 60
  const knownKey = ttsPoolKnownRedisKey()

  /**
   * Atomically acquire one slot on `poolId` if it is below `maxConcurrency`.
   * Returns true when the slot was taken (caller MUST later call `release`),
   * false when the pool is already at capacity (caller should try another pool).
   */
  async function tryAcquire(poolId: string, maxConcurrency: number): Promise<boolean> {
    const result = await redis.eval(
      ACQUIRE_SCRIPT,
      2,
      ttsPoolInflightRedisKey(poolId),
      knownKey,
      maxConcurrency,
      inflightTtlSeconds,
      poolId,
    ) as number | string
    return Number(result) >= 0
  }

  /**
   * Release one slot previously taken via {@link tryAcquire}. Idempotent and
   * floor-guarded — releasing an already-zero/expired counter is a no-op.
   */
  async function release(poolId: string): Promise<void> {
    await redis.eval(RELEASE_SCRIPT, 1, ttsPoolInflightRedisKey(poolId))
  }

  /**
   * Flag `poolId` as saturated for `ttlSeconds`. Called when an upstream
   * exhausts with a 429 (app_id concurrency exceeded upstream-side) so the
   * router skips this pool during the cool-down instead of re-probing a pool it
   * already knows is full.
   */
  async function markSaturated(poolId: string, ttlSeconds: number): Promise<void> {
    await redis.set(ttsPoolSaturatedRedisKey(poolId), '1', 'EX', ttlSeconds)
  }

  /** Whether `poolId` is within a saturation cool-down window. */
  async function isSaturated(poolId: string): Promise<boolean> {
    const exists = await redis.exists(ttsPoolSaturatedRedisKey(poolId))
    return exists === 1
  }

  /** Current in-flight count for `poolId` (0 when the counter is absent). */
  async function currentInflight(poolId: string): Promise<number> {
    const raw = await redis.get(ttsPoolInflightRedisKey(poolId))
    return raw == null ? 0 : Number(raw)
  }

  /**
   * Snapshot every known pool's in-flight count. Backs the watermark gauge —
   * reads the known-pools set, then MGETs each counter in one round-trip.
   * Returns an empty array when no pool has ever been acquired.
   */
  async function snapshot(): Promise<Array<{ poolId: string, inflight: number }>> {
    const poolIds = await redis.smembers(knownKey)
    if (poolIds.length === 0)
      return []

    const values = await redis.mget(poolIds.map(ttsPoolInflightRedisKey))
    return poolIds.map((poolId, i) => ({
      poolId,
      inflight: values[i] == null ? 0 : Number(values[i]),
    }))
  }

  return { tryAcquire, release, markSaturated, isSaturated, currentInflight, snapshot }
}

export type ConcurrencyLedger = ReturnType<typeof createConcurrencyLedger>
