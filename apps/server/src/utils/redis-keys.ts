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
