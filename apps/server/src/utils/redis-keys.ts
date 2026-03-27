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

export const DEFAULT_BILLING_EVENTS_STREAM = createRedisKey('billing', 'events')

export function configRedisKey(key: string): string {
  return createRedisKey('config', key)
}

export function userFluxRedisKey(userId: string): string {
  return createRedisKey('user', userId, 'flux')
}

export function userChatBroadcastRedisKey(userId: string): string {
  return createRedisKey('user', userId, 'chat', 'broadcast')
}

export function lockRedisKey(domain: string, ...identifiers: RedisKeyPart[]): string {
  return createRedisKey('lock', domain, ...identifiers)
}
