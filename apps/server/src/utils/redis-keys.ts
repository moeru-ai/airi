type RedisKeyPart = string | number

function normalizeRedisKeyPart(part: RedisKeyPart): string {
  const value = String(part).trim()
  if (value.length === 0)
    throw new TypeError('Redis key segments must not be empty')

  return value
}

export function createRedisKey(...parts: RedisKeyPart[]): string {
  if (parts.length === 0)
    throw new TypeError('Redis keys must contain at least one segment')

  return parts.map(normalizeRedisKeyPart).join(':')
}

export function configRedisKey(key: string): string {
  return createRedisKey('config', key)
}

export function userFluxRedisKey(userId: string): string {
  return createRedisKey('user', userId, 'flux')
}

export function ttsVoicesUpstreamCacheRedisKey(model: string): string {
  return createRedisKey('tts', 'voices', 'upstream', model)
}

export function userFluxMeterDebtRedisKey(userId: string, meterName: string): string {
  return createRedisKey('user', userId, 'flux-meter', meterName, 'debt')
}

export function userChatBroadcastRedisKey(userId: string): string {
  return createRedisKey('user', userId, 'chat', 'broadcast')
}

export function lockRedisKey(domain: string, ...identifiers: RedisKeyPart[]): string {
  return createRedisKey('lock', domain, ...identifiers)
}
