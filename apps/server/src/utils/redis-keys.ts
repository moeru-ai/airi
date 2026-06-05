type RedisKeyPart = string | number

export function redisKeyFrom(...parts: RedisKeyPart[]): string {
  if (parts.length === 0)
    throw new TypeError('Redis keys must contain at least one segment')

  return parts.map((part) => {
    const value = String(part).trim()
    if (value.length === 0)
      throw new TypeError('Redis key segments must not be empty')

    return value
  }).join(':')
}

export function configRedisKey(key: string): string {
  return redisKeyFrom('config', key)
}

export function userFluxRedisKey(userId: string): string {
  return redisKeyFrom('user', userId, 'flux')
}

export function userFluxMeterDebtRedisKey(userId: string, meterName: string): string {
  return redisKeyFrom('user', userId, 'flux-meter', meterName, 'debt')
}

export function userChatBroadcastRedisKey(userId: string): string {
  return redisKeyFrom('user', userId, 'chat', 'broadcast')
}

export function lockRedisKey(domain: string, ...identifiers: RedisKeyPart[]): string {
  return redisKeyFrom('lock', domain, ...identifiers)
}

/**
 * In-flight request counter for one TTSpool (per app_id concurrency pool).
 * `poolId` is the upstream's `adapterParams.appid` (or baseURL fallback). The
 * counter is INCR'd on slot acquire and DECR'd on release; a short TTL bounds
 * leakage if a replica crashes between acquire and release.
 */
export function ttsPoolInflightRedisKey(poolId: string): string {
  return redisKeyFrom('tts', 'pool', 'inflight', poolId)
}

/**
 * Short-TTL saturation flag for one TTSpool. Set when an upstream exhausts with
 * a 429 (app_id concurrency exceeded) so capacity-aware routing skips that pool
 * for a cool-down window instead of repeatedly hammering a known-full pool.
 */
export function ttsPoolSaturatedRedisKey(poolId: string): string {
  return redisKeyFrom('tts', 'pool', 'saturated', poolId)
}

/**
 * Set of everypool id the router has acquired a slot on. The pool watermark
 * gauge reads this set's members, then MGETs each inflight counter — avoids
 * parsing LLM_ROUTER_CONFIG inside the metric callback.
 */
export function ttsPoolKnownRedisKey(): string {
  return redisKeyFrom('tts', 'pool', 'known')
}
